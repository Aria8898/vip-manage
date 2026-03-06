import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AdminListRefundRepairTasksResponseDTO,
  type AdminRefundRepairTaskDTO,
  type AdminRetryRefundRepairTaskResponseDTO,
  type RefundRepairTaskStatus,
  type RefundRepairTaskStep,
} from "@vip/shared";
import {
  Button,
  Card,
  Input,
  InputNumber,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";

type StatusFilter = RefundRepairTaskStatus | "all";
type StepFilter = RefundRepairTaskStep | "all";

const STATUS_LABELS: Record<RefundRepairTaskStatus, string> = {
  pending: "待修复",
  resolved: "已解决",
};

const STATUS_COLORS: Record<RefundRepairTaskStatus, string> = {
  pending: "orange",
  resolved: "green",
};

const STEP_LABELS: Record<RefundRepairTaskStep, string> = {
  rollback: "回滚会员",
  referral: "调整奖励",
  bonus: "撤销赠送",
  mark_refund: "标记退款",
  resolved: "已完成",
};

const STEP_COLORS: Record<RefundRepairTaskStep, string> = {
  rollback: "volcano",
  referral: "gold",
  bonus: "purple",
  mark_refund: "blue",
  resolved: "green",
};

const formatUnixSeconds = (value: number | null) => {
  if (!value || value <= 0) {
    return "-";
  }

  return new Date(value * 1000).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
};

const toUnixSeconds = (value: string): number | null => {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.floor(parsed / 1000);
};

const escapeCsv = (value: string | number | null | undefined): string => {
  const raw = value === null || value === undefined ? "" : String(value);
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
};

const downloadCsv = (
  filename: string,
  header: string[],
  rows: Array<Array<string | number | null | undefined>>,
) => {
  const csvLines = [
    header.map((item) => escapeCsv(item)).join(","),
    ...rows.map((row) => row.map((item) => escapeCsv(item)).join(",")),
  ];
  const csvContent = `\ufeff${csvLines.join("\n")}`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const buildProgressSummary = (item: AdminRefundRepairTaskDTO) => {
  const steps = [
    item.rollbackAppliedAt ? "回滚" : null,
    item.referralAdjustedAt ? "奖励" : null,
    item.bonusRevokedAt ? "赠送" : null,
    item.refundMarkedAt ? "退款" : null,
  ].filter(Boolean);

  return steps.length > 0 ? steps.join(" / ") : "尚未开始";
};

export const RefundRepairTasksPage = () => {
  const navigate = useNavigate();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [stepFilter, setStepFilter] = useState<StepFilter>("all");
  const [query, setQuery] = useState("");
  const [updatedFromInput, setUpdatedFromInput] = useState("");
  const [updatedToInput, setUpdatedToInput] = useState("");
  const [minRetryCount, setMinRetryCount] = useState<number | null>(null);
  const [items, setItems] = useState<AdminRefundRepairTaskDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [retryingRecordId, setRetryingRecordId] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const response = await apiRequest<AdminListRefundRepairTasksResponseDTO>(
        "/admin/refund-repair-tasks",
        {
          method: "GET",
          query: {
            status: statusFilter,
            limit: 200,
          },
        },
      );
      setItems(response.data.items);
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "加载补偿任务失败",
      );
    } finally {
      setLoading(false);
    }
  }, [messageApi, statusFilter]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await apiRequest("/admin/logout", {
        method: "POST",
      });
      navigate("/admin/login", { replace: true });
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "退出失败");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleRetry = async (item: AdminRefundRepairTaskDTO) => {
    setRetryingRecordId(item.rechargeRecordId);

    try {
      const response = await apiRequest<AdminRetryRefundRepairTaskResponseDTO>(
        `/admin/refund-repair-tasks/${encodeURIComponent(item.rechargeRecordId)}/retry`,
        {
          method: "POST",
        },
      );
      messageApi.success(
        `补偿完成：${response.data.user.username}，已恢复退款闭环`,
      );
      await loadItems();
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "重试补偿任务失败",
      );
    } finally {
      setRetryingRecordId("");
    }
  };

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const updatedFrom = toUnixSeconds(updatedFromInput);
    const updatedTo = toUnixSeconds(updatedToInput);

    return items.filter((item) => {
      if (stepFilter !== "all" && item.currentStep !== stepFilter) {
        return false;
      }
      if (updatedFrom && item.updatedAt < updatedFrom) {
        return false;
      }
      if (updatedTo && item.updatedAt > updatedTo) {
        return false;
      }
      if (typeof minRetryCount === "number" && item.retryCount < minRetryCount) {
        return false;
      }
      if (!keyword) {
        return true;
      }

      const haystack = [
        item.username,
        item.userId,
        item.rechargeRecordId,
        item.rollbackRecordId ?? "",
        item.lastError,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [items, minRetryCount, query, stepFilter, updatedFromInput, updatedToInput]);

  const summary = useMemo(
    () =>
      filteredItems.reduce(
        (acc, item) => {
          acc.pending += item.status === "pending" ? 1 : 0;
          acc.resolved += item.status === "resolved" ? 1 : 0;
          acc.totalRefundAmount += item.refundAmount;
          acc.totalRetries += item.retryCount;
          return acc;
        },
        {
          pending: 0,
          resolved: 0,
          totalRefundAmount: 0,
          totalRetries: 0,
        },
      ),
    [filteredItems],
  );

  const handleResetFilters = () => {
    setStepFilter("all");
    setQuery("");
    setUpdatedFromInput("");
    setUpdatedToInput("");
    setMinRetryCount(null);
  };

  const handleExport = () => {
    const rows = filteredItems.map((item) => [
      item.id,
      item.username,
      item.userId,
      item.rechargeRecordId,
      item.rollbackRecordId,
      STATUS_LABELS[item.status],
      STEP_LABELS[item.currentStep],
      item.refundAmount.toFixed(2),
      item.retryCount,
      item.lastError,
      formatUnixSeconds(item.rollbackAppliedAt),
      formatUnixSeconds(item.referralAdjustedAt),
      formatUnixSeconds(item.bonusRevokedAt),
      formatUnixSeconds(item.refundMarkedAt),
      formatUnixSeconds(item.updatedAt),
      formatUnixSeconds(item.resolvedAt),
    ]);

    const now = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    downloadCsv(
      `refund-repair-tasks-${now}.csv`,
      [
        "任务ID",
        "用户名",
        "用户ID",
        "原充值流水ID",
        "回滚流水ID",
        "状态",
        "当前阶段",
        "退款金额(元)",
        "重试次数",
        "最近错误",
        "回滚完成时间",
        "奖励调整时间",
        "赠送撤销时间",
        "退款标记时间",
        "最近更新时间",
        "解决时间",
      ],
      rows,
    );
  };

  const columns = useMemo<ColumnsType<AdminRefundRepairTaskDTO>>(
    () => [
      {
        title: "最近更新时间",
        dataIndex: "updatedAt",
        key: "updatedAt",
        width: 170,
        render: (value: number) => formatUnixSeconds(value),
      },
      {
        title: "用户",
        key: "user",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.username}</Typography.Text>
            <Typography.Text type="secondary" code>
              {record.userId}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "原充值流水",
        dataIndex: "rechargeRecordId",
        key: "rechargeRecordId",
        width: 180,
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      {
        title: "回滚流水",
        dataIndex: "rollbackRecordId",
        key: "rollbackRecordId",
        width: 180,
        render: (value: string | null) =>
          value ? <Typography.Text code>{value}</Typography.Text> : "-",
      },
      {
        title: "状态",
        key: "status",
        width: 110,
        render: (_, record) => (
          <Space direction="vertical" size={4}>
            <Tag color={STATUS_COLORS[record.status]}>
              {STATUS_LABELS[record.status]}
            </Tag>
            <Tag color={STEP_COLORS[record.currentStep]}>
              {STEP_LABELS[record.currentStep]}
            </Tag>
          </Space>
        ),
      },
      {
        title: "退款信息",
        key: "refund",
        width: 160,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{`¥${record.refundAmount.toFixed(2)}`}</Typography.Text>
            <Typography.Text type="secondary">
              {record.refundNote || "无备注"}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "阶段进度",
        key: "progress",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{buildProgressSummary(record)}</Typography.Text>
            <Typography.Text type="secondary">
              退款标记：{formatUnixSeconds(record.refundMarkedAt)}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "重试次数",
        dataIndex: "retryCount",
        key: "retryCount",
        width: 100,
      },
      {
        title: "最近错误",
        dataIndex: "lastError",
        key: "lastError",
        render: (value: string) => value || "-",
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 110,
        render: (_, record) => (
          <Button
            type="primary"
            size="small"
            disabled={record.status !== "pending"}
            loading={retryingRecordId === record.rechargeRecordId}
            onClick={() => {
              void handleRetry(record);
            }}
          >
            立即重试
          </Button>
        ),
      },
    ],
    [retryingRecordId],
  );

  return (
    <main className="shell admin-shell">
      {messageContextHolder}

      <Card className="admin-header-card" bordered={false}>
        <div className="admin-header-row">
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              退款补偿任务
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              查看退款闭环失败任务，定位卡点并手动重试。
            </Typography.Paragraph>
          </div>
          <Space>
            <Button onClick={() => navigate("/admin")}>用户管理</Button>
            <Button onClick={() => navigate("/admin/referral-rewards")}>奖励流水</Button>
            <Button onClick={() => navigate("/admin/referral-withdrawals")}>提现流水</Button>
            <Button type="primary" onClick={() => navigate("/admin/refund-repair-tasks")}>
              补偿任务
            </Button>
            <Button onClick={() => navigate("/admin/alert-events")}>告警中心</Button>
            <Button onClick={handleLogout} loading={loggingOut}>
              退出登录
            </Button>
          </Space>
        </div>
      </Card>

      <Card className="admin-table-card" bordered={false}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select<StatusFilter>
            value={statusFilter}
            style={{ width: 150 }}
            onChange={setStatusFilter}
            options={[
              { value: "pending", label: "待修复" },
              { value: "resolved", label: "已解决" },
              { value: "all", label: "全部状态" },
            ]}
          />
          <Select<StepFilter>
            value={stepFilter}
            style={{ width: 150 }}
            onChange={setStepFilter}
            options={[
              { value: "all", label: "全部阶段" },
              { value: "rollback", label: STEP_LABELS.rollback },
              { value: "referral", label: STEP_LABELS.referral },
              { value: "bonus", label: STEP_LABELS.bonus },
              { value: "mark_refund", label: STEP_LABELS.mark_refund },
              { value: "resolved", label: STEP_LABELS.resolved },
            ]}
          />
          <Input
            style={{ width: 320 }}
            placeholder="筛选用户名 / 用户ID / 流水ID / 错误信息"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Input
            type="datetime-local"
            style={{ width: 220 }}
            value={updatedFromInput}
            onChange={(event) => setUpdatedFromInput(event.target.value)}
          />
          <Input
            type="datetime-local"
            style={{ width: 220 }}
            value={updatedToInput}
            onChange={(event) => setUpdatedToInput(event.target.value)}
          />
          <InputNumber<number>
            style={{ width: 150 }}
            min={0}
            precision={0}
            placeholder="最少重试次数"
            value={minRetryCount ?? undefined}
            onChange={(value) => setMinRetryCount(typeof value === "number" ? value : null)}
          />
          <Button onClick={() => void loadItems()} loading={loading}>
            刷新
          </Button>
          <Button onClick={handleResetFilters}>
            重置筛选
          </Button>
          <Button onClick={handleExport} disabled={filteredItems.length === 0}>
            导出 CSV
          </Button>
        </Space>

        <Space size={24} wrap style={{ marginBottom: 12 }}>
          <Statistic title="待修复" value={summary.pending} />
          <Statistic title="已解决" value={summary.resolved} />
          <Statistic
            title="涉及退款金额"
            value={summary.totalRefundAmount}
            prefix="¥"
            precision={2}
          />
          <Statistic title="累计重试次数" value={summary.totalRetries} />
        </Space>

        <Table<AdminRefundRepairTaskDTO>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredItems}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1800 }}
        />
      </Card>
    </main>
  );
};

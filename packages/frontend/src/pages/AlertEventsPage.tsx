import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AdminAcknowledgeAlertEventResponseDTO,
  type AdminAlertEventDTO,
  type AdminAlertSeverity,
  type AdminAlertStatus,
  type AdminListAlertEventsResponseDTO,
} from "@vip/shared";
import {
  Button,
  Card,
  Input,
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

import { ADMIN_ROUTES } from "../app/routes";
import { apiRequest } from "../api/client";

type StatusFilter = AdminAlertStatus | "all";
type SeverityFilter = AdminAlertSeverity | "all";

const STATUS_LABELS: Record<AdminAlertStatus, string> = {
  open: "未处理",
  acknowledged: "已确认",
};

const STATUS_COLORS: Record<AdminAlertStatus, string> = {
  open: "red",
  acknowledged: "green",
};

const SEVERITY_LABELS: Record<AdminAlertSeverity, string> = {
  error: "错误",
  warning: "警告",
};

const SEVERITY_COLORS: Record<AdminAlertSeverity, string> = {
  error: "volcano",
  warning: "gold",
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

export const AlertEventsPage = () => {
  const navigate = useNavigate();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AdminAlertEventDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [acknowledgingAlertId, setAcknowledgingAlertId] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const response = await apiRequest<AdminListAlertEventsResponseDTO>(
        "/admin/alert-events",
        {
          method: "GET",
          query: {
            status: statusFilter,
            severity: severityFilter,
            limit: 200,
          },
        },
      );
      setItems(response.data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载告警失败");
    } finally {
      setLoading(false);
    }
  }, [messageApi, severityFilter, statusFilter]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await apiRequest("/admin/logout", {
        method: "POST",
      });
      navigate(ADMIN_ROUTES.login, { replace: true });
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "退出失败");
    } finally {
      setLoggingOut(false);
    }
  };

  const handleAcknowledge = async (item: AdminAlertEventDTO) => {
    setAcknowledgingAlertId(item.id);

    try {
      await apiRequest<AdminAcknowledgeAlertEventResponseDTO>(
        `/admin/alert-events/${encodeURIComponent(item.id)}/acknowledge`,
        {
          method: "POST",
        },
      );
      messageApi.success(`告警已确认：${item.title}`);
      await loadItems();
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "确认告警失败");
    } finally {
      setAcknowledgingAlertId("");
    }
  };

  const filteredItems = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return items;
    }

    return items.filter((item) => {
      const haystack = [
        item.category,
        item.title,
        item.message,
        item.requestId ?? "",
        item.dedupeKey ?? "",
        item.detailJson ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [items, query]);

  const summary = useMemo(
    () =>
      filteredItems.reduce(
        (acc, item) => {
          acc.open += item.status === "open" ? 1 : 0;
          acc.acknowledged += item.status === "acknowledged" ? 1 : 0;
          acc.errors += item.severity === "error" ? 1 : 0;
          acc.warnings += item.severity === "warning" ? 1 : 0;
          acc.occurrences += item.occurrenceCount;
          return acc;
        },
        {
          open: 0,
          acknowledged: 0,
          errors: 0,
          warnings: 0,
          occurrences: 0,
        },
      ),
    [filteredItems],
  );

  const handleExport = () => {
    const rows = filteredItems.map((item) => [
      item.id,
      SEVERITY_LABELS[item.severity],
      STATUS_LABELS[item.status],
      item.category,
      item.title,
      item.message,
      item.requestId,
      item.dedupeKey,
      item.occurrenceCount,
      formatUnixSeconds(item.lastOccurredAt),
      formatUnixSeconds(item.updatedAt),
      formatUnixSeconds(item.acknowledgedAt),
      item.acknowledgedByAdminId,
      item.detailJson,
    ]);

    const now = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    downloadCsv(
      `alert-events-${now}.csv`,
      [
        "告警ID",
        "级别",
        "状态",
        "分类",
        "标题",
        "消息",
        "请求ID",
        "去重键",
        "累计次数",
        "最后发生时间",
        "最近更新时间",
        "确认时间",
        "确认管理员ID",
        "详情JSON",
      ],
      rows,
    );
  };

  const columns = useMemo<ColumnsType<AdminAlertEventDTO>>(
    () => [
      {
        title: "最近发生",
        dataIndex: "lastOccurredAt",
        key: "lastOccurredAt",
        width: 170,
        render: (value: number) => formatUnixSeconds(value),
      },
      {
        title: "级别",
        key: "severity",
        width: 90,
        render: (_, record) => (
          <Tag color={SEVERITY_COLORS[record.severity]}>
            {SEVERITY_LABELS[record.severity]}
          </Tag>
        ),
      },
      {
        title: "状态",
        key: "status",
        width: 90,
        render: (_, record) => (
          <Tag color={STATUS_COLORS[record.status]}>
            {STATUS_LABELS[record.status]}
          </Tag>
        ),
      },
      {
        title: "告警信息",
        key: "alert",
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{record.title}</Typography.Text>
            <Typography.Text type="secondary">
              {record.category}
            </Typography.Text>
            <Typography.Text>{record.message}</Typography.Text>
          </Space>
        ),
      },
      {
        title: "请求 / 去重键",
        key: "keys",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text code>{record.requestId || "-"}</Typography.Text>
            <Typography.Text type="secondary" code>
              {record.dedupeKey || "-"}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "累计次数",
        dataIndex: "occurrenceCount",
        key: "occurrenceCount",
        width: 90,
      },
      {
        title: "详情",
        dataIndex: "detailJson",
        key: "detailJson",
        width: 260,
        render: (value: string | null) => value || "-",
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 110,
        render: (_, record) => (
          <Button
            size="small"
            type="primary"
            disabled={record.status !== "open"}
            loading={acknowledgingAlertId === record.id}
            onClick={() => {
              void handleAcknowledge(record);
            }}
          >
            确认
          </Button>
        ),
      },
    ],
    [acknowledgingAlertId],
  );

  return (
    <main className="shell admin-shell">
      {messageContextHolder}

      <Card className="admin-header-card" bordered={false}>
        <div className="admin-header-row">
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              告警中心
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              聚合关键失败事件，支持筛选、导出和人工确认。
            </Typography.Paragraph>
          </div>
          <Space>
            <Button onClick={() => navigate(ADMIN_ROUTES.home)}>用户管理</Button>
            <Button onClick={() => navigate(ADMIN_ROUTES.referralRewards)}>
              奖励流水
            </Button>
            <Button onClick={() => navigate(ADMIN_ROUTES.referralWithdrawals)}>
              提现流水
            </Button>
            <Button onClick={() => navigate(ADMIN_ROUTES.refundRepairTasks)}>
              补偿任务
            </Button>
            <Button
              type="primary"
              onClick={() => navigate(ADMIN_ROUTES.alertEvents)}
            >
              告警中心
            </Button>
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
              { value: "open", label: "未处理" },
              { value: "acknowledged", label: "已确认" },
              { value: "all", label: "全部状态" },
            ]}
          />
          <Select<SeverityFilter>
            value={severityFilter}
            style={{ width: 150 }}
            onChange={setSeverityFilter}
            options={[
              { value: "all", label: "全部级别" },
              { value: "error", label: "错误" },
              { value: "warning", label: "警告" },
            ]}
          />
          <Input
            style={{ width: 360 }}
            placeholder="筛选分类 / 标题 / 消息 / 请求ID / 去重键"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button onClick={() => void loadItems()} loading={loading}>
            刷新
          </Button>
          <Button onClick={handleExport} disabled={filteredItems.length === 0}>
            导出 CSV
          </Button>
        </Space>

        <Space size={24} wrap style={{ marginBottom: 12 }}>
          <Statistic title="未处理" value={summary.open} />
          <Statistic title="已确认" value={summary.acknowledged} />
          <Statistic title="错误" value={summary.errors} />
          <Statistic title="警告" value={summary.warnings} />
          <Statistic title="累计发生次数" value={summary.occurrences} />
        </Space>

        <Table<AdminAlertEventDTO>
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

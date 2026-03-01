import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RechargeReason,
  RechargeRecordSource,
  ReferralRewardStatus,
  type AdminListReferralRewardsResponseDTO,
  type AdminReferralRewardRecordDTO,
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

import { apiRequest } from "../api/client";

type StatusFilter = ReferralRewardStatus | "all";

const REASON_LABELS: Record<RechargeReason, string> = {
  [RechargeReason.WECHAT_PAY]: "微信支付",
  [RechargeReason.ALIPAY]: "支付宝支付",
  [RechargeReason.PLATFORM_ORDER]: "平台下单",
  [RechargeReason.REFERRAL_REWARD]: "推荐奖励",
  [RechargeReason.CAMPAIGN_GIFT]: "活动赠送",
  [RechargeReason.AFTER_SALES]: "售后补偿",
  [RechargeReason.MANUAL_FIX]: "手动修正",
};

const SOURCE_LABELS: Record<RechargeRecordSource, string> = {
  [RechargeRecordSource.NORMAL]: "普通充值",
  [RechargeRecordSource.BACKFILL]: "历史补录",
  [RechargeRecordSource.SYSTEM_BONUS]: "系统赠送",
  [RechargeRecordSource.REFUND_ROLLBACK]: "退款回滚",
};

const STATUS_LABELS: Record<ReferralRewardStatus, string> = {
  [ReferralRewardStatus.PENDING]: "预计奖励",
  [ReferralRewardStatus.AVAILABLE]: "可提现",
  [ReferralRewardStatus.CANCELED]: "已失效",
  [ReferralRewardStatus.WITHDRAWN]: "已提现",
};

const STATUS_COLORS: Record<ReferralRewardStatus, string> = {
  [ReferralRewardStatus.PENDING]: "orange",
  [ReferralRewardStatus.AVAILABLE]: "green",
  [ReferralRewardStatus.CANCELED]: "default",
  [ReferralRewardStatus.WITHDRAWN]: "blue",
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

const formatUnixSeconds = (value: number | null) => {
  if (!value || value <= 0) {
    return "-";
  }

  return new Date(value * 1000).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
};

const formatCurrency = (value: number) => `¥${value.toFixed(2)}`;

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

export const ReferralRewardsPage = () => {
  const navigate = useNavigate();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [inviterQuery, setInviterQuery] = useState("");
  const [inviteeQuery, setInviteeQuery] = useState("");
  const [createdFromInput, setCreatedFromInput] = useState("");
  const [createdToInput, setCreatedToInput] = useState("");
  const [items, setItems] = useState<AdminReferralRewardRecordDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const response = await apiRequest<AdminListReferralRewardsResponseDTO>(
        "/admin/referral-rewards",
        {
          method: "GET",
          query: {
            status: statusFilter,
            limit: 1000,
          },
        },
      );
      setItems(response.data.items);
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "加载邀请奖励流水失败",
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

  const filteredItems = useMemo(() => {
    const inviterKeyword = inviterQuery.trim().toLowerCase();
    const inviteeKeyword = inviteeQuery.trim().toLowerCase();
    const createdFrom = toUnixSeconds(createdFromInput);
    const createdTo = toUnixSeconds(createdToInput);

    return items.filter((item) => {
      if (inviterKeyword) {
        const inviterText = `${item.inviterUsername} ${item.inviterUserId}`.toLowerCase();
        if (!inviterText.includes(inviterKeyword)) {
          return false;
        }
      }

      if (inviteeKeyword) {
        const inviteeText = `${item.inviteeUsername} ${item.inviteeUserId}`.toLowerCase();
        if (!inviteeText.includes(inviteeKeyword)) {
          return false;
        }
      }

      if (createdFrom && item.createdAt < createdFrom) {
        return false;
      }
      if (createdTo && item.createdAt > createdTo) {
        return false;
      }

      return true;
    });
  }, [createdFromInput, createdToInput, inviteeQuery, inviterQuery, items]);

  const summary = useMemo(() => {
    return filteredItems.reduce(
      (acc, item) => {
        if (item.status === ReferralRewardStatus.PENDING) {
          acc.pending += item.rewardAmount;
        }
        if (item.status === ReferralRewardStatus.AVAILABLE) {
          acc.available += item.rewardAmount;
        }
        if (item.status === ReferralRewardStatus.WITHDRAWN) {
          acc.withdrawn += item.rewardAmount;
        }
        return acc;
      },
      { pending: 0, available: 0, withdrawn: 0 },
    );
  }, [filteredItems]);

  const handleExport = () => {
    const rows = filteredItems.map((item) => [
      item.id,
      item.inviterUsername,
      item.inviterUserId,
      item.inviteeUsername,
      item.inviteeUserId,
      item.rechargeRecordId,
      REASON_LABELS[item.rechargeReason] ?? item.rechargeReason,
      SOURCE_LABELS[item.rechargeSource] ?? item.rechargeSource,
      item.paymentAmount.toFixed(2),
      item.rewardAmount.toFixed(2),
      STATUS_LABELS[item.status],
      formatUnixSeconds(item.unlockAt),
      formatUnixSeconds(item.availableAt),
      formatUnixSeconds(item.withdrawnAt),
      formatUnixSeconds(item.canceledAt),
      item.canceledReason,
      formatUnixSeconds(item.createdAt),
    ]);

    const now = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    downloadCsv(
      `referral-rewards-${now}.csv`,
      [
        "奖励ID",
        "邀请人",
        "邀请人ID",
        "被邀请人",
        "被邀请人ID",
        "充值流水ID",
        "充值原因",
        "充值来源",
        "充值金额(元)",
        "奖励金额(元)",
        "状态",
        "解锁时间",
        "可提现时间",
        "提现时间",
        "失效时间",
        "失效原因",
        "创建时间",
      ],
      rows,
    );
  };

  const columns = useMemo<ColumnsType<AdminReferralRewardRecordDTO>>(
    () => [
      {
        title: "创建时间",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 170,
        render: (value: number) => formatUnixSeconds(value),
      },
      {
        title: "邀请人",
        key: "inviter",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.inviterUsername}</Typography.Text>
            <Typography.Text type="secondary" code>
              {record.inviterUserId}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "被邀请人",
        key: "invitee",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.inviteeUsername}</Typography.Text>
            <Typography.Text type="secondary" code>
              {record.inviteeUserId}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "充值流水",
        dataIndex: "rechargeRecordId",
        key: "rechargeRecordId",
        width: 180,
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>,
      },
      {
        title: "充值信息",
        key: "rechargeInfo",
        width: 180,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>
              {REASON_LABELS[record.rechargeReason] ?? record.rechargeReason}
            </Typography.Text>
            <Typography.Text type="secondary">
              {SOURCE_LABELS[record.rechargeSource] ?? record.rechargeSource}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "支付金额",
        dataIndex: "paymentAmount",
        key: "paymentAmount",
        width: 110,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: "奖励金额",
        dataIndex: "rewardAmount",
        key: "rewardAmount",
        width: 110,
        render: (value: number) => formatCurrency(value),
      },
      {
        title: "状态",
        dataIndex: "status",
        key: "status",
        width: 110,
        render: (value: ReferralRewardStatus) => (
          <Tag color={STATUS_COLORS[value]}>{STATUS_LABELS[value]}</Tag>
        ),
      },
      {
        title: "解锁时间",
        dataIndex: "unlockAt",
        key: "unlockAt",
        width: 170,
        render: (value: number) => formatUnixSeconds(value),
      },
      {
        title: "提现时间",
        dataIndex: "withdrawnAt",
        key: "withdrawnAt",
        width: 170,
        render: (value: number | null) => formatUnixSeconds(value),
      },
      {
        title: "失效原因",
        dataIndex: "canceledReason",
        key: "canceledReason",
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value || "-",
      },
    ],
    [],
  );

  return (
    <main className="shell admin-shell">
      {messageContextHolder}

      <Card className="admin-header-card" bordered={false}>
        <div className="admin-header-row">
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              邀请奖励流水
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              支持按状态、邀请人、被邀请人和时间筛选，并导出 CSV。
            </Typography.Paragraph>
          </div>
          <Space>
            <Button onClick={() => navigate("/admin")}>用户管理</Button>
            <Button type="primary" onClick={() => navigate("/admin/referral-withdrawals")}>提现流水</Button>
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
              { value: "all", label: "全部状态" },
              { value: ReferralRewardStatus.PENDING, label: "预计奖励" },
              { value: ReferralRewardStatus.AVAILABLE, label: "可提现" },
              { value: ReferralRewardStatus.CANCELED, label: "已失效" },
              { value: ReferralRewardStatus.WITHDRAWN, label: "已提现" },
            ]}
          />
          <Input
            style={{ width: 220 }}
            placeholder="筛选邀请人（用户名/ID）"
            value={inviterQuery}
            onChange={(event) => setInviterQuery(event.target.value)}
          />
          <Input
            style={{ width: 220 }}
            placeholder="筛选被邀请人（用户名/ID）"
            value={inviteeQuery}
            onChange={(event) => setInviteeQuery(event.target.value)}
          />
          <Input
            type="datetime-local"
            style={{ width: 220 }}
            value={createdFromInput}
            onChange={(event) => setCreatedFromInput(event.target.value)}
          />
          <Input
            type="datetime-local"
            style={{ width: 220 }}
            value={createdToInput}
            onChange={(event) => setCreatedToInput(event.target.value)}
          />
          <Button onClick={() => void loadItems()} loading={loading}>
            刷新
          </Button>
          <Button onClick={handleExport} disabled={filteredItems.length === 0}>
            导出 CSV
          </Button>
        </Space>

        <Space size={24} wrap style={{ marginBottom: 12 }}>
          <Statistic title="预计奖励" value={summary.pending} prefix="¥" precision={2} />
          <Statistic title="可提现" value={summary.available} prefix="¥" precision={2} />
          <Statistic title="已提现" value={summary.withdrawn} prefix="¥" precision={2} />
          <Statistic title="记录数" value={filteredItems.length} />
        </Space>

        <Table<AdminReferralRewardRecordDTO>
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

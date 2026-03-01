import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AdminListReferralWithdrawalsResponseDTO,
  type AdminReferralWithdrawalDTO,
} from "@vip/shared";
import {
  Button,
  Card,
  Input,
  Space,
  Statistic,
  Table,
  Typography,
  message,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";

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

const formatUnixSeconds = (value: number) => {
  if (value <= 0) {
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

export const ReferralWithdrawalsPage = () => {
  const navigate = useNavigate();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [inviterQuery, setInviterQuery] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [createdFromInput, setCreatedFromInput] = useState("");
  const [createdToInput, setCreatedToInput] = useState("");
  const [items, setItems] = useState<AdminReferralWithdrawalDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);

    try {
      const response = await apiRequest<AdminListReferralWithdrawalsResponseDTO>(
        "/admin/referral-withdrawals",
        {
          method: "GET",
          query: {
            limit: 1000,
          },
        },
      );
      setItems(response.data.items);
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "加载提现流水失败",
      );
    } finally {
      setLoading(false);
    }
  }, [messageApi]);

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
    const adminKeyword = adminQuery.trim().toLowerCase();
    const createdFrom = toUnixSeconds(createdFromInput);
    const createdTo = toUnixSeconds(createdToInput);

    return items.filter((item) => {
      if (inviterKeyword) {
        const inviterText = `${item.inviterUsername} ${item.inviterUserId}`.toLowerCase();
        if (!inviterText.includes(inviterKeyword)) {
          return false;
        }
      }

      if (adminKeyword) {
        const adminText = `${item.processedByAdminUsername} ${item.processedByAdminId}`.toLowerCase();
        if (!adminText.includes(adminKeyword)) {
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
  }, [adminQuery, createdFromInput, createdToInput, inviterQuery, items]);

  const totalAmount = useMemo(
    () => filteredItems.reduce((sum, item) => sum + item.amount, 0),
    [filteredItems],
  );

  const handleExport = () => {
    const rows = filteredItems.map((item) => [
      item.id,
      item.inviterUsername,
      item.inviterUserId,
      item.amount.toFixed(2),
      item.processedByAdminUsername,
      item.processedByAdminId,
      item.note,
      formatUnixSeconds(item.createdAt),
    ]);

    const now = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
    downloadCsv(
      `referral-withdrawals-${now}.csv`,
      [
        "提现ID",
        "邀请人",
        "邀请人ID",
        "提现金额(元)",
        "处理管理员",
        "处理管理员ID",
        "备注",
        "处理时间",
      ],
      rows,
    );
  };

  const columns = useMemo<ColumnsType<AdminReferralWithdrawalDTO>>(
    () => [
      {
        title: "处理时间",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 180,
        render: (value: number) => formatUnixSeconds(value),
      },
      {
        title: "邀请人",
        key: "inviter",
        width: 240,
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
        title: "提现金额",
        dataIndex: "amount",
        key: "amount",
        width: 140,
        render: (value: number) => (
          <Typography.Text type="success">{formatCurrency(value)}</Typography.Text>
        ),
      },
      {
        title: "处理管理员",
        key: "admin",
        width: 240,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.processedByAdminUsername}</Typography.Text>
            <Typography.Text type="secondary" code>
              {record.processedByAdminId}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: "备注",
        dataIndex: "note",
        key: "note",
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
              邀请奖励提现流水
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              支持按邀请人、管理员和时间筛选，并导出 CSV。
            </Typography.Paragraph>
          </div>
          <Space>
            <Button onClick={() => navigate("/admin")}>用户管理</Button>
            <Button type="primary" onClick={() => navigate("/admin/referral-rewards")}>奖励流水</Button>
            <Button onClick={handleLogout} loading={loggingOut}>
              退出登录
            </Button>
          </Space>
        </div>
      </Card>

      <Card className="admin-table-card" bordered={false}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Input
            style={{ width: 240 }}
            placeholder="筛选邀请人（用户名/ID）"
            value={inviterQuery}
            onChange={(event) => setInviterQuery(event.target.value)}
          />
          <Input
            style={{ width: 240 }}
            placeholder="筛选管理员（用户名/ID）"
            value={adminQuery}
            onChange={(event) => setAdminQuery(event.target.value)}
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
          <Statistic title="提现总额" value={totalAmount} prefix="¥" precision={2} />
          <Statistic title="记录数" value={filteredItems.length} />
        </Space>

        <Table<AdminReferralWithdrawalDTO>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredItems}
          pagination={{ pageSize: 20, showSizeChanger: false }}
          scroll={{ x: 1300 }}
        />
      </Card>
    </main>
  );
};

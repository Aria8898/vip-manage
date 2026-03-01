import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RechargeReason,
  type AdminCreateUserResponseDTO,
  type AdminDashboardTodayDTO,
  type AdminListRechargeRecordsResponseDTO,
  type AdminResetUserTokenResponseDTO,
  type AdminListUsersResponseDTO,
  type AdminRechargeRecordDTO,
  type AdminRechargeUserResponseDTO,
  type AdminUserDTO
} from "@vip/shared";
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { fetchAdminSession } from "../auth/session";

interface CreateUserFormValues {
  remarkName: string;
}

interface RechargeFormValues {
  days: number;
  reason: RechargeReason;
  internalNote?: string;
}

const RECHARGE_REASON_LABELS: Record<RechargeReason, string> = {
  [RechargeReason.WECHAT_PAY]: "微信支付",
  [RechargeReason.ALIPAY]: "支付宝支付",
  [RechargeReason.CAMPAIGN_GIFT]: "活动赠送",
  [RechargeReason.AFTER_SALES]: "售后补偿",
  [RechargeReason.MANUAL_FIX]: "手动修正"
};

const MAX_INTERNAL_NOTE_LENGTH = 200;

export const AdminShellPage = () => {
  const navigate = useNavigate();
  const [createUserForm] = Form.useForm<CreateUserFormValues>();
  const [rechargeForm] = Form.useForm<RechargeFormValues>();
  const [messageApi, messageContextHolder] = message.useMessage();
  const [username, setUsername] = useState<string>("-");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [users, setUsers] = useState<AdminUserDTO[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQueryInput, setSearchQueryInput] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [copiedUserId, setCopiedUserId] = useState("");
  const [sessionErrorMessage, setSessionErrorMessage] = useState("");
  const [dashboard, setDashboard] = useState<AdminDashboardTodayDTO | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [rechargeRecords, setRechargeRecords] = useState<AdminRechargeRecordDTO[]>([]);
  const [loadingRechargeRecords, setLoadingRechargeRecords] = useState(false);
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false);
  const [submittingRecharge, setSubmittingRecharge] = useState(false);
  const [rechargeTargetUser, setRechargeTargetUser] = useState<AdminUserDTO | null>(null);
  const [resettingTokenUserId, setResettingTokenUserId] = useState("");

  const loadUsers = useCallback(async (query: string) => {
    setLoadingUsers(true);

    try {
      const response = await apiRequest<AdminListUsersResponseDTO>("/admin/users", {
        method: "GET",
        query: query ? { query } : undefined
      });
      setUsers(response.data.items);
      setActiveQuery(response.data.query);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载用户列表失败");
    } finally {
      setLoadingUsers(false);
    }
  }, [messageApi]);

  const loadDashboard = useCallback(async () => {
    setLoadingDashboard(true);

    try {
      const response = await apiRequest<AdminDashboardTodayDTO>("/admin/dashboard/today", {
        method: "GET"
      });
      setDashboard(response.data);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载今日概览失败");
    } finally {
      setLoadingDashboard(false);
    }
  }, [messageApi]);

  const loadRechargeRecords = useCallback(async () => {
    setLoadingRechargeRecords(true);

    try {
      const response = await apiRequest<AdminListRechargeRecordsResponseDTO>("/admin/recharge-records", {
        method: "GET",
        query: {
          limit: 100
        }
      });
      setRechargeRecords(response.data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载充值流水失败");
    } finally {
      setLoadingRechargeRecords(false);
    }
  }, [messageApi]);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const session = await fetchAdminSession();
        if (!cancelled) {
          setUsername(session.username);
          setExpiresAt(session.expiresAt);
        }
      } catch (error) {
        if (!cancelled) {
          setSessionErrorMessage(error instanceof Error ? error.message : "加载会话失败");
        }
      }
    };

    void loadSession();
    void loadUsers("");
    void loadDashboard();
    void loadRechargeRecords();

    return () => {
      cancelled = true;
    };
  }, [loadDashboard, loadRechargeRecords, loadUsers]);

  const handleLogout = async () => {
    setLoggingOut(true);

    try {
      await apiRequest("/admin/logout", {
        method: "POST"
      });
      navigate("/admin/login", { replace: true });
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "退出失败");
    } finally {
      setLoggingOut(false);
    }
  };

  const formatUnixSeconds = useCallback((value: number) => {
    if (value <= 0) {
      return "未设置";
    }

    return new Date(value * 1000).toLocaleString("zh-CN", {
      hour12: false,
      timeZone: "Asia/Shanghai"
    });
  }, []);

  const buildStatusLink = useCallback((statusToken: string) => {
    const encodedToken = encodeURIComponent(statusToken);
    return `${window.location.origin}/status/${encodedToken}?t=${encodedToken}`;
  }, []);

  const formatRechargeReason = useCallback((reason: RechargeReason) => {
    return RECHARGE_REASON_LABELS[reason] || reason;
  }, []);

  const handleSearch = async (query: string) => {
    const normalized = query.trim();
    setSearchQueryInput(normalized);
    await loadUsers(normalized);
  };

  const closeRechargeModal = useCallback(() => {
    setRechargeModalOpen(false);
    setRechargeTargetUser(null);
    rechargeForm.resetFields();
  }, [rechargeForm]);

  const handleCreateUserSubmit = async () => {
    try {
      const values = await createUserForm.validateFields();
      const remarkName = values.remarkName.trim();
      if (!remarkName) {
        return;
      }

      setSubmittingCreate(true);
      const response = await apiRequest<AdminCreateUserResponseDTO>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          remarkName
        })
      });

      const createdUser = response.data.user;
      createUserForm.resetFields();
      setCreateModalOpen(false);
      setSearchQueryInput("");
      await loadUsers("");

      const statusLink = buildStatusLink(createdUser.statusToken);
      await navigator.clipboard.writeText(statusLink);
      setCopiedUserId(createdUser.id);
      messageApi.success(`已创建并复制链接：${createdUser.remarkName}`);
    } catch (error) {
      if (typeof error === "object" && error !== null && "errorFields" in error) {
        return;
      }
      messageApi.error(error instanceof Error ? error.message : "创建用户失败");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const handleCopyLink = async (user: AdminUserDTO) => {
    const statusLink = buildStatusLink(user.statusToken);

    try {
      await navigator.clipboard.writeText(statusLink);
      setCopiedUserId(user.id);
      messageApi.success(`已复制链接：${user.remarkName}`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "复制失败");
    }
  };

  const handleOpenRechargeModal = (user: AdminUserDTO) => {
    setRechargeTargetUser(user);
    setRechargeModalOpen(true);
    rechargeForm.setFieldsValue({
      days: 30,
      reason: RechargeReason.WECHAT_PAY,
      internalNote: ""
    });
  };

  const handleResetToken = async (user: AdminUserDTO) => {
    setResettingTokenUserId(user.id);

    try {
      const response = await apiRequest<AdminResetUserTokenResponseDTO>(
        `/admin/users/${encodeURIComponent(user.id)}/reset-token`,
        {
          method: "POST"
        }
      );
      const statusLink = buildStatusLink(response.data.user.statusToken);
      await navigator.clipboard.writeText(statusLink);
      setCopiedUserId(user.id);
      await loadUsers(activeQuery);
      messageApi.success(`已重置并复制新链接：${user.remarkName}`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "重置 Token 失败");
    } finally {
      setResettingTokenUserId("");
    }
  };

  const handleRechargeSubmit = async () => {
    if (!rechargeTargetUser) {
      return;
    }

    try {
      const values = await rechargeForm.validateFields();
      setSubmittingRecharge(true);
      const response = await apiRequest<AdminRechargeUserResponseDTO>(
        `/admin/users/${encodeURIComponent(rechargeTargetUser.id)}/recharge`,
        {
          method: "POST",
          body: JSON.stringify({
            days: values.days,
            reason: values.reason,
            internalNote: values.internalNote?.trim() || undefined
          })
        }
      );

      closeRechargeModal();
      await Promise.all([loadUsers(activeQuery), loadDashboard(), loadRechargeRecords()]);
      messageApi.success(
        `充值成功：${response.data.user.remarkName}，当前到期 ${formatUnixSeconds(response.data.user.expireAt)}`
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "errorFields" in error) {
        return;
      }
      messageApi.error(error instanceof Error ? error.message : "充值失败");
    } finally {
      setSubmittingRecharge(false);
    }
  };

  const userCountText = useMemo(() => {
    const prefix = activeQuery ? `搜索 “${activeQuery}”` : "全部用户";
    return `${prefix}：${users.length} 条`;
  }, [activeQuery, users.length]);

  const dashboardRangeText = useMemo(() => {
    if (!dashboard) {
      return "统计范围（UTC+8）：-";
    }

    return `统计范围（UTC+8）：${formatUnixSeconds(dashboard.dayStartAt)} - ${formatUnixSeconds(
      dashboard.dayEndAt - 1
    )}`;
  }, [dashboard, formatUnixSeconds]);

  const userColumns = useMemo<ColumnsType<AdminUserDTO>>(
    () => [
      {
        title: "用户 ID",
        dataIndex: "id",
        key: "id",
        ellipsis: true,
        render: (value: string) => <Typography.Text code>{value}</Typography.Text>
      },
      {
        title: "备注名",
        dataIndex: "remarkName",
        key: "remarkName"
      },
      {
        title: "状态",
        dataIndex: "expireAt",
        key: "status",
        width: 120,
        render: (expireAt: number) =>
          expireAt > Math.floor(Date.now() / 1000) ? (
            <Tag color="green">有效</Tag>
          ) : (
            <Tag color="default">未生效/过期</Tag>
          )
      },
      {
        title: "到期时间",
        dataIndex: "expireAt",
        key: "expireAt",
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "创建时间",
        dataIndex: "createdAt",
        key: "createdAt",
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "操作",
        key: "actions",
        width: 320,
        render: (_, user) => (
          <Space size="small" wrap>
            <Button type={copiedUserId === user.id ? "default" : "primary"} onClick={() => handleCopyLink(user)}>
              {copiedUserId === user.id ? "已复制" : "复制链接"}
            </Button>
            <Button onClick={() => handleOpenRechargeModal(user)}>充值</Button>
            <Popconfirm
              title="重置 Token"
              description="旧链接会立即失效，确认继续？"
              okText="确认重置"
              cancelText="取消"
              onConfirm={() => {
                void handleResetToken(user);
              }}
            >
              <Button danger loading={resettingTokenUserId === user.id}>
                重置 Token
              </Button>
            </Popconfirm>
          </Space>
        )
      }
    ],
    [
      copiedUserId,
      formatUnixSeconds,
      handleCopyLink,
      handleOpenRechargeModal,
      handleResetToken,
      resettingTokenUserId
    ]
  );

  const rechargeRecordColumns = useMemo<ColumnsType<AdminRechargeRecordDTO>>(
    () => [
      {
        title: "时间",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 180,
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "用户",
        dataIndex: "userRemarkName",
        key: "userRemarkName",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.userRemarkName}</Typography.Text>
            <Typography.Text type="secondary" code>
              {record.userId}
            </Typography.Text>
          </Space>
        )
      },
      {
        title: "变动天数",
        dataIndex: "changeDays",
        key: "changeDays",
        width: 100,
        render: (value: number) => <Typography.Text type="success">+{value}</Typography.Text>
      },
      {
        title: "充值前到期",
        dataIndex: "expireBefore",
        key: "expireBefore",
        width: 180,
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "充值后到期",
        dataIndex: "expireAfter",
        key: "expireAfter",
        width: 180,
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "原因",
        dataIndex: "reason",
        key: "reason",
        width: 140,
        render: (value: RechargeReason) => formatRechargeReason(value)
      },
      {
        title: "内部备注",
        dataIndex: "internalNote",
        key: "internalNote",
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value || "-"
      },
      {
        title: "操作管理员",
        dataIndex: "operatorAdminUsername",
        key: "operatorAdminUsername",
        width: 140
      }
    ],
    [formatRechargeReason, formatUnixSeconds]
  );

  return (
    <main className="shell admin-shell">
      {messageContextHolder}

      <Card className="admin-header-card" bordered={false}>
        <div className="admin-header-row">
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              用户管理（P4 用户端完善）
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              已登录账号：{username}
            </Typography.Paragraph>
            {expiresAt > 0 ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                会话到期时间：{formatUnixSeconds(expiresAt)}
              </Typography.Paragraph>
            ) : null}
          </div>
          <Space>
            <Button type="primary" onClick={() => setCreateModalOpen(true)}>
              新增用户
            </Button>
            <Button onClick={handleLogout} loading={loggingOut}>
              退出登录
            </Button>
          </Space>
        </div>
        {sessionErrorMessage ? <Typography.Text type="danger">{sessionErrorMessage}</Typography.Text> : null}
      </Card>

      <Card className="admin-overview-card" bordered={false}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          今日概览
        </Typography.Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12}>
            <Statistic title="今日充值次数" value={dashboard?.rechargeCount || 0} loading={loadingDashboard} />
          </Col>
          <Col xs={24} sm={12}>
            <Statistic title="今日送出总天数" value={dashboard?.totalChangeDays || 0} loading={loadingDashboard} suffix="天" />
          </Col>
        </Row>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0, marginTop: 12 }}>
          {dashboardRangeText}
        </Typography.Paragraph>
      </Card>

      <Card className="admin-table-card" bordered={false}>
        <div className="admin-toolbar-row">
          <Input.Search
            value={searchQueryInput}
            allowClear
            placeholder="按备注名或用户 ID 搜索"
            enterButton="搜索"
            onChange={(event) => setSearchQueryInput(event.target.value)}
            onSearch={(value) => {
              void handleSearch(value);
            }}
          />
          <Typography.Text type="secondary">{userCountText}</Typography.Text>
        </div>

        <Table<AdminUserDTO>
          rowKey="id"
          loading={loadingUsers}
          columns={userColumns}
          dataSource={users}
          pagination={{
            pageSize: 20,
            showSizeChanger: false
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Card className="admin-records-card" bordered={false}>
        <div className="admin-toolbar-row">
          <Typography.Title level={5} style={{ margin: 0 }}>
            充值流水（最近 {rechargeRecords.length} 条）
          </Typography.Title>
          <Button onClick={() => void loadRechargeRecords()} loading={loadingRechargeRecords}>
            刷新流水
          </Button>
        </div>

        <Table<AdminRechargeRecordDTO>
          rowKey="id"
          loading={loadingRechargeRecords}
          columns={rechargeRecordColumns}
          dataSource={rechargeRecords}
          pagination={{
            pageSize: 10,
            showSizeChanger: false
          }}
          scroll={{ x: 1500 }}
        />
      </Card>

      <Modal
        title="新增用户"
        open={createModalOpen}
        okText="创建并复制链接"
        cancelText="取消"
        confirmLoading={submittingCreate}
        onOk={() => {
          void handleCreateUserSubmit();
        }}
        onCancel={() => {
          setCreateModalOpen(false);
          createUserForm.resetFields();
        }}
      >
        <Form<CreateUserFormValues> layout="vertical" form={createUserForm}>
          <Form.Item
            label="用户备注名"
            name="remarkName"
            rules={[
              {
                required: true,
                message: "请输入用户备注名"
              },
              {
                max: 80,
                message: "最多 80 个字符"
              }
            ]}
          >
            <Input placeholder="例如：微信名-大刘" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="用户充值"
        open={rechargeModalOpen}
        okText="确认充值"
        cancelText="取消"
        confirmLoading={submittingRecharge}
        onOk={() => {
          void handleRechargeSubmit();
        }}
        onCancel={closeRechargeModal}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card size="small">
            <Typography.Text>
              充值用户：{rechargeTargetUser?.remarkName || "-"}（{rechargeTargetUser?.id || "-"}）
            </Typography.Text>
            <br />
            <Typography.Text type="secondary">
              当前到期：{formatUnixSeconds(rechargeTargetUser?.expireAt || 0)}
            </Typography.Text>
          </Card>

          <Form<RechargeFormValues> layout="vertical" form={rechargeForm}>
            <Form.Item
              label="充值天数"
              name="days"
              rules={[
                {
                  required: true,
                  message: "请输入充值天数"
                }
              ]}
            >
              <InputNumber min={1} max={3650} precision={0} style={{ width: "100%" }} placeholder="例如：30" />
            </Form.Item>
            <Form.Item
              label="充值原因"
              name="reason"
              rules={[
                {
                  required: true,
                  message: "请选择充值原因"
                }
              ]}
            >
              <Select
                options={Object.entries(RECHARGE_REASON_LABELS).map(([value, label]) => ({
                  value,
                  label
                }))}
                placeholder="请选择充值原因"
              />
            </Form.Item>
            <Form.Item label="内部备注" name="internalNote">
              <Input.TextArea
                maxLength={MAX_INTERNAL_NOTE_LENGTH}
                showCount
                rows={3}
                placeholder="可选，用于记录转账单号、订单备注等"
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </main>
  );
};

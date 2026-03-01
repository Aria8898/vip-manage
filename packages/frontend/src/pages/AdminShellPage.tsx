import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminCreateUserResponseDTO,
  AdminListUsersResponseDTO,
  AdminUserDTO
} from "@vip/shared";
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
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

export const AdminShellPage = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm<CreateUserFormValues>();
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

    return () => {
      cancelled = true;
    };
  }, [loadUsers]);

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

  const handleSearch = async (query: string) => {
    const normalized = query.trim();
    setSearchQueryInput(normalized);
    await loadUsers(normalized);
  };

  const handleCreateUserSubmit = async () => {
    try {
      const values = await form.validateFields();
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
      form.resetFields();
      setCreateModalOpen(false);
      setSearchQueryInput("");
      await loadUsers("");

      const statusLink = buildStatusLink(createdUser.statusToken);
      await navigator.clipboard.writeText(statusLink);
      setCopiedUserId(createdUser.id);
      messageApi.success(`已创建并复制链接：${createdUser.remarkName}`);
    } catch (error) {
      if (error instanceof Error && "errorFields" in error) {
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

  const userCountText = useMemo(() => {
    const prefix = activeQuery ? `搜索 “${activeQuery}”` : "全部用户";
    return `${prefix}：${users.length} 条`;
  }, [activeQuery, users.length]);

  const columns = useMemo<ColumnsType<AdminUserDTO>>(
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
        width: 120,
        render: (_, user) => (
          <Button type={copiedUserId === user.id ? "default" : "primary"} onClick={() => handleCopyLink(user)}>
            {copiedUserId === user.id ? "已复制" : "复制链接"}
          </Button>
        )
      }
    ],
    [copiedUserId, formatUnixSeconds, handleCopyLink]
  );

  return (
    <main className="shell admin-shell">
      {messageContextHolder}

      <Card className="admin-header-card" bordered={false}>
        <div className="admin-header-row">
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              用户管理（P2）
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
          columns={columns}
          dataSource={users}
          pagination={{
            pageSize: 20,
            showSizeChanger: false
          }}
          scroll={{ x: 980 }}
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
          form.resetFields();
        }}
      >
        <Form<CreateUserFormValues> layout="vertical" form={form}>
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
    </main>
  );
};

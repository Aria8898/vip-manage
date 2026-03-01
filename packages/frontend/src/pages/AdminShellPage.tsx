import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RechargeReason,
  RechargeRecordSource,
  UserProfileChangeField,
  type AdminCreateUserResponseDTO,
  type AdminDashboardTodayDTO,
  type AdminListUserProfileChangeLogsResponseDTO,
  type AdminListRechargeRecordsResponseDTO,
  type AdminResetUserTokenResponseDTO,
  type AdminListUsersResponseDTO,
  type AdminRechargeRecordDTO,
  type AdminRechargeUserResponseDTO,
  type AdminUpdateUserResponseDTO,
  type AdminUserDTO,
  type AdminUserProfileChangeRecordDTO
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
  username: string;
  systemEmail?: string;
  familyGroupName?: string;
  userEmail?: string;
}

interface RechargeFormValues {
  days: number;
  reason: RechargeReason;
  paymentAmount: number;
  internalNote?: string;
}

interface BackfillFormValues {
  days: number;
  reason: RechargeReason;
  paymentAmount: number;
  occurredAtInput: string;
  internalNote?: string;
}

interface UpdateUserFormValues {
  username: string;
  systemEmail?: string;
  familyGroupName?: string;
  userEmail?: string;
  systemEmailNote?: string;
  familyGroupNameNote?: string;
  userEmailNote?: string;
}

const RECHARGE_REASON_LABELS: Record<RechargeReason, string> = {
  [RechargeReason.WECHAT_PAY]: "微信支付",
  [RechargeReason.ALIPAY]: "支付宝支付",
  [RechargeReason.CAMPAIGN_GIFT]: "活动赠送",
  [RechargeReason.AFTER_SALES]: "售后补偿",
  [RechargeReason.MANUAL_FIX]: "手动修正"
};

const RECHARGE_SOURCE_LABELS: Record<RechargeRecordSource, string> = {
  [RechargeRecordSource.NORMAL]: "普通充值",
  [RechargeRecordSource.BACKFILL]: "历史补录"
};

const MAX_INTERNAL_NOTE_LENGTH = 200;
const MAX_PROFILE_CHANGE_NOTE_LENGTH = 200;

const PROFILE_FIELD_LABELS: Record<UserProfileChangeField, string> = {
  [UserProfileChangeField.SYSTEM_EMAIL]: "系统邮箱",
  [UserProfileChangeField.FAMILY_GROUP_NAME]: "家庭组名称",
  [UserProfileChangeField.USER_EMAIL]: "用户邮箱"
};

export const AdminShellPage = () => {
  const navigate = useNavigate();
  const [createUserForm] = Form.useForm<CreateUserFormValues>();
  const [updateUserForm] = Form.useForm<UpdateUserFormValues>();
  const [rechargeForm] = Form.useForm<RechargeFormValues>();
  const [backfillForm] = Form.useForm<BackfillFormValues>();
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
  const [profileChangeLogs, setProfileChangeLogs] = useState<AdminUserProfileChangeRecordDTO[]>([]);
  const [loadingProfileChangeLogs, setLoadingProfileChangeLogs] = useState(false);
  const [rechargeModalOpen, setRechargeModalOpen] = useState(false);
  const [submittingRecharge, setSubmittingRecharge] = useState(false);
  const [rechargeTargetUser, setRechargeTargetUser] = useState<AdminUserDTO | null>(null);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [updateTargetUser, setUpdateTargetUser] = useState<AdminUserDTO | null>(null);
  const [backfillModalOpen, setBackfillModalOpen] = useState(false);
  const [submittingBackfill, setSubmittingBackfill] = useState(false);
  const [backfillTargetUser, setBackfillTargetUser] = useState<AdminUserDTO | null>(null);
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

  const loadProfileChangeLogs = useCallback(async () => {
    setLoadingProfileChangeLogs(true);

    try {
      const response = await apiRequest<AdminListUserProfileChangeLogsResponseDTO>(
        "/admin/user-profile-change-logs",
        {
          method: "GET",
          query: {
            limit: 100
          }
        }
      );
      setProfileChangeLogs(response.data.items);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "加载资料变更记录失败");
    } finally {
      setLoadingProfileChangeLogs(false);
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
    void loadProfileChangeLogs();

    return () => {
      cancelled = true;
    };
  }, [loadDashboard, loadProfileChangeLogs, loadRechargeRecords, loadUsers]);

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

  const formatRechargeSource = useCallback((source: RechargeRecordSource) => {
    return RECHARGE_SOURCE_LABELS[source] || source;
  }, []);

  const formatPaymentAmount = useCallback((amount: number) => {
    return `¥${amount.toFixed(2)}`;
  }, []);

  const formatProfileChangeField = useCallback((field: UserProfileChangeField) => {
    return PROFILE_FIELD_LABELS[field] || field;
  }, []);

  const toLocalDateTimeInput = useCallback((unixSeconds: number) => {
    const date = new Date(unixSeconds * 1000);
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return shifted.toISOString().slice(0, 16);
  }, []);

  const parseLocalDateTimeInput = useCallback((value: string): number | null => {
    const parsedMs = Date.parse(value);
    if (Number.isNaN(parsedMs)) {
      return null;
    }

    return Math.floor(parsedMs / 1000);
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

  const closeBackfillModal = useCallback(() => {
    setBackfillModalOpen(false);
    setBackfillTargetUser(null);
    backfillForm.resetFields();
  }, [backfillForm]);

  const closeUpdateModal = useCallback(() => {
    setUpdateModalOpen(false);
    setUpdateTargetUser(null);
    updateUserForm.resetFields();
  }, [updateUserForm]);

  const handleOpenUpdateModal = (user: AdminUserDTO) => {
    setUpdateTargetUser(user);
    setUpdateModalOpen(true);
    updateUserForm.setFieldsValue({
      username: user.username,
      systemEmail: user.systemEmail || undefined,
      familyGroupName: user.familyGroupName || undefined,
      userEmail: user.userEmail || undefined,
      systemEmailNote: "",
      familyGroupNameNote: "",
      userEmailNote: ""
    });
  };

  const handleUpdateUserSubmit = async () => {
    if (!updateTargetUser) {
      return;
    }

    try {
      const values = await updateUserForm.validateFields();
      const username = values.username.trim();
      if (!username) {
        messageApi.error("请输入用户名");
        return;
      }

      const systemEmail = values.systemEmail?.trim().toLowerCase() || undefined;
      const familyGroupName = values.familyGroupName?.trim() || undefined;
      const userEmail = values.userEmail?.trim().toLowerCase() || undefined;
      const systemEmailChanged = (updateTargetUser.systemEmail ?? null) !== (systemEmail ?? null);
      const familyGroupNameChanged =
        (updateTargetUser.familyGroupName ?? null) !== (familyGroupName ?? null);
      const userEmailChanged = (updateTargetUser.userEmail ?? null) !== (userEmail ?? null);

      const systemEmailNote = values.systemEmailNote?.trim();
      const familyGroupNameNote = values.familyGroupNameNote?.trim();
      const userEmailNote = values.userEmailNote?.trim();
      if (systemEmailChanged && !systemEmailNote) {
        messageApi.error("系统邮箱变更时需要填写备注");
        return;
      }
      if (familyGroupNameChanged && !familyGroupNameNote) {
        messageApi.error("家庭组名称变更时需要填写备注");
        return;
      }
      if (userEmailChanged && !userEmailNote) {
        messageApi.error("用户邮箱变更时需要填写备注");
        return;
      }

      const changeNotes: Partial<Record<UserProfileChangeField, string>> = {};
      if (systemEmailChanged && systemEmailNote) {
        changeNotes[UserProfileChangeField.SYSTEM_EMAIL] = systemEmailNote;
      }
      if (familyGroupNameChanged && familyGroupNameNote) {
        changeNotes[UserProfileChangeField.FAMILY_GROUP_NAME] = familyGroupNameNote;
      }
      if (userEmailChanged && userEmailNote) {
        changeNotes[UserProfileChangeField.USER_EMAIL] = userEmailNote;
      }

      setSubmittingUpdate(true);
      const response = await apiRequest<AdminUpdateUserResponseDTO>(
        `/admin/users/${encodeURIComponent(updateTargetUser.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            username,
            systemEmail,
            familyGroupName,
            userEmail,
            changeNotes: Object.keys(changeNotes).length > 0 ? changeNotes : undefined
          })
        }
      );

      closeUpdateModal();
      await Promise.all([loadUsers(activeQuery), loadProfileChangeLogs()]);
      messageApi.success(`资料已更新：${response.data.user.username}`);
    } catch (error) {
      if (typeof error === "object" && error !== null && "errorFields" in error) {
        return;
      }
      messageApi.error(error instanceof Error ? error.message : "更新用户资料失败");
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleCreateUserSubmit = async () => {
    try {
      const values = await createUserForm.validateFields();
      const username = values.username.trim();
      if (!username) {
        return;
      }
      const systemEmail = values.systemEmail?.trim().toLowerCase() || undefined;
      const familyGroupName = values.familyGroupName?.trim() || undefined;
      const userEmail = values.userEmail?.trim().toLowerCase() || undefined;

      setSubmittingCreate(true);
      const response = await apiRequest<AdminCreateUserResponseDTO>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          username,
          systemEmail,
          familyGroupName,
          userEmail
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
      messageApi.success(`已创建并复制链接：${createdUser.username}`);
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
      messageApi.success(`已复制链接：${user.username}`);
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
      paymentAmount: 0,
      internalNote: ""
    });
  };

  const handleOpenBackfillModal = (user: AdminUserDTO) => {
    setBackfillTargetUser(user);
    setBackfillModalOpen(true);
    backfillForm.setFieldsValue({
      days: 30,
      reason: RechargeReason.WECHAT_PAY,
      paymentAmount: 0,
      occurredAtInput: toLocalDateTimeInput(Math.floor(Date.now() / 1000)),
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
      messageApi.success(`已重置并复制新链接：${user.username}`);
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
            paymentAmount: values.paymentAmount,
            internalNote: values.internalNote?.trim() || undefined
          })
        }
      );

      closeRechargeModal();
      await Promise.all([loadUsers(activeQuery), loadDashboard(), loadRechargeRecords()]);
      messageApi.success(
        `充值成功：${response.data.user.username}，当前到期 ${formatUnixSeconds(response.data.user.expireAt)}`
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

  const handleBackfillSubmit = async () => {
    if (!backfillTargetUser) {
      return;
    }

    try {
      const values = await backfillForm.validateFields();
      const occurredAt = parseLocalDateTimeInput(values.occurredAtInput);
      if (!occurredAt) {
        messageApi.error("发生时间格式无效");
        return;
      }

      setSubmittingBackfill(true);
      const response = await apiRequest<AdminRechargeUserResponseDTO>(
        `/admin/users/${encodeURIComponent(backfillTargetUser.id)}/recharge/backfill`,
        {
          method: "POST",
          body: JSON.stringify({
            days: values.days,
            reason: values.reason,
            paymentAmount: values.paymentAmount,
            occurredAt,
            internalNote: values.internalNote?.trim() || undefined
          })
        }
      );

      closeBackfillModal();
      await Promise.all([loadUsers(activeQuery), loadDashboard(), loadRechargeRecords()]);
      messageApi.success(
        `补录成功：${response.data.user.username}，当前到期 ${formatUnixSeconds(response.data.user.expireAt)}`
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && "errorFields" in error) {
        return;
      }
      messageApi.error(error instanceof Error ? error.message : "历史补录失败");
    } finally {
      setSubmittingBackfill(false);
    }
  };

  const userCountText = useMemo(() => {
    const prefix = activeQuery ? `搜索 “${activeQuery}”` : "全部用户";
    return `${prefix}：${users.length} 条`;
  }, [activeQuery, users.length]);

  const dashboardRangeText = useMemo(() => {
    if (!dashboard) {
      return "统计范围（录入时间，UTC+8）：-";
    }

    return `统计范围（录入时间，UTC+8）：${formatUnixSeconds(dashboard.dayStartAt)} - ${formatUnixSeconds(
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
        title: "用户名",
        dataIndex: "username",
        key: "username"
      },
      {
        title: "家庭组名称",
        dataIndex: "familyGroupName",
        key: "familyGroupName",
        render: (value: string | null) => value || "-"
      },
      {
        title: "系统邮箱",
        dataIndex: "systemEmail",
        key: "systemEmail",
        render: (value: string | null) => value || "-"
      },
      {
        title: "用户邮箱",
        dataIndex: "userEmail",
        key: "userEmail",
        render: (value: string | null) => value || "-"
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
        width: 500,
        render: (_, user) => (
          <Space size="small" wrap>
            <Button type={copiedUserId === user.id ? "default" : "primary"} onClick={() => handleCopyLink(user)}>
              {copiedUserId === user.id ? "已复制" : "复制链接"}
            </Button>
            <Button onClick={() => handleOpenUpdateModal(user)}>编辑资料</Button>
            <Button onClick={() => handleOpenRechargeModal(user)}>充值</Button>
            <Button onClick={() => handleOpenBackfillModal(user)}>历史补录</Button>
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
      handleOpenBackfillModal,
      handleOpenRechargeModal,
      handleOpenUpdateModal,
      handleResetToken,
      resettingTokenUserId
    ]
  );

  const rechargeRecordColumns = useMemo<ColumnsType<AdminRechargeRecordDTO>>(
    () => [
      {
        title: "来源",
        dataIndex: "source",
        key: "source",
        width: 120,
        render: (value: RechargeRecordSource) => formatRechargeSource(value)
      },
      {
        title: "发生时间",
        dataIndex: "occurredAt",
        key: "occurredAt",
        width: 180,
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "录入时间",
        dataIndex: "recordedAt",
        key: "recordedAt",
        width: 180,
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "用户",
        dataIndex: "username",
        key: "username",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.username}</Typography.Text>
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
        title: "支付金额",
        dataIndex: "paymentAmount",
        key: "paymentAmount",
        width: 120,
        render: (value: number) => formatPaymentAmount(value)
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
    [formatPaymentAmount, formatRechargeReason, formatRechargeSource, formatUnixSeconds]
  );

  const profileChangeLogColumns = useMemo<ColumnsType<AdminUserProfileChangeRecordDTO>>(
    () => [
      {
        title: "变更时间",
        dataIndex: "createdAt",
        key: "createdAt",
        width: 180,
        render: (value: number) => formatUnixSeconds(value)
      },
      {
        title: "用户",
        dataIndex: "username",
        key: "username",
        width: 220,
        render: (_, record) => (
          <Space direction="vertical" size={0}>
            <Typography.Text>{record.username}</Typography.Text>
            <Typography.Text type="secondary" code>
              {record.userId}
            </Typography.Text>
          </Space>
        )
      },
      {
        title: "变更字段",
        dataIndex: "field",
        key: "field",
        width: 140,
        render: (value: UserProfileChangeField) => formatProfileChangeField(value)
      },
      {
        title: "旧值",
        dataIndex: "beforeValue",
        key: "beforeValue",
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value || "-"
      },
      {
        title: "新值",
        dataIndex: "afterValue",
        key: "afterValue",
        width: 220,
        ellipsis: true,
        render: (value: string | null) => value || "-"
      },
      {
        title: "变更备注",
        dataIndex: "changeNote",
        key: "changeNote",
        width: 260,
        ellipsis: true
      },
      {
        title: "操作管理员",
        dataIndex: "operatorAdminUsername",
        key: "operatorAdminUsername",
        width: 140
      }
    ],
    [formatProfileChangeField, formatUnixSeconds]
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
            placeholder="按用户名或用户 ID 搜索"
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
          scroll={{ x: 1600 }}
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
          scroll={{ x: 1800 }}
        />
      </Card>

      <Card className="admin-records-card" bordered={false}>
        <div className="admin-toolbar-row">
          <Typography.Title level={5} style={{ margin: 0 }}>
            资料变更记录（最近 {profileChangeLogs.length} 条）
          </Typography.Title>
          <Button onClick={() => void loadProfileChangeLogs()} loading={loadingProfileChangeLogs}>
            刷新记录
          </Button>
        </div>

        <Table<AdminUserProfileChangeRecordDTO>
          rowKey="id"
          loading={loadingProfileChangeLogs}
          columns={profileChangeLogColumns}
          dataSource={profileChangeLogs}
          pagination={{
            pageSize: 10,
            showSizeChanger: false
          }}
          scroll={{ x: 1600 }}
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
            label="用户名"
            name="username"
            rules={[
              {
                required: true,
                message: "请输入用户名"
              },
              {
                max: 80,
                message: "最多 80 个字符"
              }
            ]}
          >
            <Input placeholder="例如：微信名-大刘" />
          </Form.Item>
          <Form.Item
            label="系统邮箱"
            name="systemEmail"
            rules={[
              {
                type: "email",
                message: "请输入有效邮箱"
              },
              {
                max: 120,
                message: "最多 120 个字符"
              }
            ]}
          >
            <Input placeholder="可选，例如：ops@company.com" />
          </Form.Item>
          <Form.Item
            label="家庭组名称"
            name="familyGroupName"
            rules={[
              {
                max: 80,
                message: "最多 80 个字符"
              }
            ]}
          >
            <Input placeholder="可选，例如：Unisat CRM" />
          </Form.Item>
          <Form.Item
            label="用户邮箱"
            name="userEmail"
            rules={[
              {
                type: "email",
                message: "请输入有效邮箱"
              },
              {
                max: 120,
                message: "最多 120 个字符"
              }
            ]}
          >
            <Input placeholder="可选，例如：user@example.com" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑用户资料"
        open={updateModalOpen}
        okText="保存修改"
        cancelText="取消"
        confirmLoading={submittingUpdate}
        onOk={() => {
          void handleUpdateUserSubmit();
        }}
        onCancel={closeUpdateModal}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card size="small">
            <Typography.Text>
              用户：{updateTargetUser?.username || "-"}（{updateTargetUser?.id || "-"}）
            </Typography.Text>
          </Card>

          <Form<UpdateUserFormValues> layout="vertical" form={updateUserForm}>
            <Form.Item
              label="用户名"
              name="username"
              rules={[
                {
                  required: true,
                  message: "请输入用户名"
                },
                {
                  max: 80,
                  message: "最多 80 个字符"
                }
              ]}
            >
              <Input placeholder="例如：微信名-大刘" />
            </Form.Item>

            <Form.Item
              label="系统邮箱"
              name="systemEmail"
              rules={[
                {
                  type: "email",
                  message: "请输入有效邮箱"
                },
                {
                  max: 120,
                  message: "最多 120 个字符"
                }
              ]}
            >
              <Input placeholder="可选，例如：ops@company.com" />
            </Form.Item>
            <Form.Item
              label="系统邮箱变更备注"
              name="systemEmailNote"
              rules={[
                {
                  max: MAX_PROFILE_CHANGE_NOTE_LENGTH,
                  message: `最多 ${MAX_PROFILE_CHANGE_NOTE_LENGTH} 个字符`
                }
              ]}
            >
              <Input.TextArea
                rows={2}
                showCount
                maxLength={MAX_PROFILE_CHANGE_NOTE_LENGTH}
                placeholder="仅在系统邮箱发生变更时必填"
              />
            </Form.Item>

            <Form.Item
              label="家庭组名称"
              name="familyGroupName"
              rules={[
                {
                  max: 80,
                  message: "最多 80 个字符"
                }
              ]}
            >
              <Input placeholder="可选，例如：Unisat CRM" />
            </Form.Item>
            <Form.Item
              label="家庭组名称变更备注"
              name="familyGroupNameNote"
              rules={[
                {
                  max: MAX_PROFILE_CHANGE_NOTE_LENGTH,
                  message: `最多 ${MAX_PROFILE_CHANGE_NOTE_LENGTH} 个字符`
                }
              ]}
            >
              <Input.TextArea
                rows={2}
                showCount
                maxLength={MAX_PROFILE_CHANGE_NOTE_LENGTH}
                placeholder="仅在家庭组名称发生变更时必填"
              />
            </Form.Item>

            <Form.Item
              label="用户邮箱"
              name="userEmail"
              rules={[
                {
                  type: "email",
                  message: "请输入有效邮箱"
                },
                {
                  max: 120,
                  message: "最多 120 个字符"
                }
              ]}
            >
              <Input placeholder="可选，例如：user@example.com" />
            </Form.Item>
            <Form.Item
              label="用户邮箱变更备注"
              name="userEmailNote"
              rules={[
                {
                  max: MAX_PROFILE_CHANGE_NOTE_LENGTH,
                  message: `最多 ${MAX_PROFILE_CHANGE_NOTE_LENGTH} 个字符`
                }
              ]}
            >
              <Input.TextArea
                rows={2}
                showCount
                maxLength={MAX_PROFILE_CHANGE_NOTE_LENGTH}
                placeholder="仅在用户邮箱发生变更时必填"
              />
            </Form.Item>
          </Form>
        </Space>
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
              充值用户：{rechargeTargetUser?.username || "-"}（{rechargeTargetUser?.id || "-"}）
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
            <Form.Item
              label="支付金额（元）"
              name="paymentAmount"
              rules={[
                {
                  required: true,
                  message: "请输入支付金额"
                }
              ]}
            >
              <InputNumber
                min={0}
                precision={2}
                step={0.01}
                style={{ width: "100%" }}
                placeholder="例如：99.00"
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

      <Modal
        title="历史补录"
        open={backfillModalOpen}
        okText="确认补录并重算"
        cancelText="取消"
        confirmLoading={submittingBackfill}
        onOk={() => {
          void handleBackfillSubmit();
        }}
        onCancel={closeBackfillModal}
      >
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Card size="small">
            <Typography.Text>
              补录用户：{backfillTargetUser?.username || "-"}（{backfillTargetUser?.id || "-"}）
            </Typography.Text>
            <br />
            <Typography.Text type="secondary">
              当前到期：{formatUnixSeconds(backfillTargetUser?.expireAt || 0)}
            </Typography.Text>
          </Card>

          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            历史补录会按“发生时间”重排并重算该用户后续流水。
          </Typography.Paragraph>

          <Form<BackfillFormValues> layout="vertical" form={backfillForm}>
            <Form.Item
              label="发生时间（本地时区）"
              name="occurredAtInput"
              rules={[
                {
                  required: true,
                  message: "请选择发生时间"
                }
              ]}
            >
              <Input type="datetime-local" />
            </Form.Item>
            <Form.Item
              label="补录天数"
              name="days"
              rules={[
                {
                  required: true,
                  message: "请输入补录天数"
                }
              ]}
            >
              <InputNumber min={1} max={3650} precision={0} style={{ width: "100%" }} placeholder="例如：30" />
            </Form.Item>
            <Form.Item
              label="补录原因"
              name="reason"
              rules={[
                {
                  required: true,
                  message: "请选择补录原因"
                }
              ]}
            >
              <Select
                options={Object.entries(RECHARGE_REASON_LABELS).map(([value, label]) => ({
                  value,
                  label
                }))}
                placeholder="请选择补录原因"
              />
            </Form.Item>
            <Form.Item
              label="支付金额（元）"
              name="paymentAmount"
              rules={[
                {
                  required: true,
                  message: "请输入支付金额"
                }
              ]}
            >
              <InputNumber
                min={0}
                precision={2}
                step={0.01}
                style={{ width: "100%" }}
                placeholder="例如：99.00"
              />
            </Form.Item>
            <Form.Item label="内部备注" name="internalNote">
              <Input.TextArea
                maxLength={MAX_INTERNAL_NOTE_LENGTH}
                showCount
                rows={3}
                placeholder="可选，建议记录外部系统单号或原始凭证"
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </main>
  );
};

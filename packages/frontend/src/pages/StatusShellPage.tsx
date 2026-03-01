import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  MembershipStatus,
  RechargeReason,
  type UserStatusHistoryRecordDTO,
  type UserStatusResponseDTO,
} from "@vip/shared";
import {
  Alert,
  Card,
  Empty,
  Skeleton,
  Space,
  Statistic,
  Tag,
  Timeline,
  Typography,
} from "antd";
import { useLocation, useParams } from "react-router-dom";

import { apiRequest, ApiRequestError } from "../api/client";

const REASON_LABELS: Record<RechargeReason, string> = {
  [RechargeReason.WECHAT_PAY]: "微信支付",
  [RechargeReason.ALIPAY]: "支付宝支付",
  [RechargeReason.PLATFORM_ORDER]: "平台下单",
  [RechargeReason.REFERRAL_REWARD]: "推荐奖励",
  [RechargeReason.CAMPAIGN_GIFT]: "活动赠送",
  [RechargeReason.AFTER_SALES]: "售后补偿",
  [RechargeReason.MANUAL_FIX]: "手动修正",
};

interface HistoryReasonVisualConfig {
  timelineColor: string;
  reasonTagStyle: CSSProperties;
  changeDaysStyle: CSSProperties;
}

const DEFAULT_HISTORY_REASON_VISUAL: HistoryReasonVisualConfig = {
  timelineColor: "green",
  reasonTagStyle: {
    marginInlineEnd: 0,
    borderColor: "#d9d9d9",
    backgroundColor: "#f5f5f5",
    color: "rgba(0, 0, 0, 0.72)",
    fontWeight: 600,
  },
  changeDaysStyle: {
    color: "rgba(0, 0, 0, 0.88)",
    fontWeight: 600,
  },
};

const HISTORY_REASON_VISUAL_CONFIG: Partial<
  Record<RechargeReason, HistoryReasonVisualConfig>
> = {
  [RechargeReason.REFERRAL_REWARD]: {
    timelineColor: "#f59e0b",
    reasonTagStyle: {
      marginInlineEnd: 0,
      borderColor: "#f59e0b",
      backgroundColor: "#fef3c7",
      color: "#92400e",
      fontWeight: 700,
    },
    changeDaysStyle: {
      color: "#b45309",
      fontWeight: 700,
    },
  },
  [RechargeReason.CAMPAIGN_GIFT]: {
    timelineColor: "#06b6d4",
    reasonTagStyle: {
      marginInlineEnd: 0,
      borderColor: "#22d3ee",
      backgroundColor: "#cffafe",
      color: "#0e7490",
      fontWeight: 700,
    },
    changeDaysStyle: {
      color: "#0e7490",
      fontWeight: 700,
    },
  },
  [RechargeReason.AFTER_SALES]: {
    timelineColor: "#ec4899",
    reasonTagStyle: {
      marginInlineEnd: 0,
      borderColor: "#f9a8d4",
      backgroundColor: "#fdf2f8",
      color: "#be185d",
      fontWeight: 700,
    },
    changeDaysStyle: {
      color: "#be185d",
      fontWeight: 700,
    },
  },
};

const formatUnixSeconds = (value: number) => {
  if (value <= 0) {
    return "未设置";
  }

  return new Date(value * 1000).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
};

const formatCurrency = (value: number): string => `¥${value.toFixed(2)}`;

const getHistoryReasonVisual = (
  reason: RechargeReason,
): HistoryReasonVisualConfig =>
  HISTORY_REASON_VISUAL_CONFIG[reason] ?? DEFAULT_HISTORY_REASON_VISUAL;

const formatHistoryChangeDays = (record: UserStatusHistoryRecordDTO): string =>
  `${record.changeDays >= 0 ? "+" : ""}${record.changeDays} 天`;

export const StatusShellPage = () => {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusData, setStatusData] = useState<UserStatusResponseDTO | null>(
    null,
  );

  const resolvedToken = useMemo(() => {
    const queryToken = new URLSearchParams(location.search).get("t");
    return (token || queryToken || "").trim();
  }, [location.search, token]);

  useEffect(() => {
    let cancelled = false;

    const loadStatus = async () => {
      if (!resolvedToken) {
        setErrorMessage("缺少访问 Token，请检查链接是否完整。");
        setStatusData(null);
        return;
      }

      setLoading(true);
      setErrorMessage("");
      try {
        const response = await apiRequest<UserStatusResponseDTO>(
          `/status/${encodeURIComponent(resolvedToken)}`,
          {
            method: "GET",
          },
        );

        if (!cancelled) {
          setStatusData(response.data);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (error instanceof ApiRequestError && error.status === 404) {
          setErrorMessage("链接已失效或不存在，请联系管理员获取新链接。");
        } else {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "状态加载失败，请稍后重试。",
          );
        }
        setStatusData(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, [resolvedToken]);

  const isActive = statusData?.user.status === MembershipStatus.ACTIVE;
  const isExpiringSoon = isActive && (statusData?.user.remainingDays || 0) < 3;

  return (
    <main className="shell status-shell">
      <Card bordered={false}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : errorMessage ? (
          <Alert type="error" showIcon message={errorMessage} />
        ) : statusData ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div>
              <Typography.Title level={3} style={{ marginBottom: 8 }}>
                你好，{statusData.user.username}
              </Typography.Title>

              <Space wrap style={{ marginBottom: 8 }}>
                <Typography.Text type="secondary">
                  {statusData.user.userEmail || ""}
                </Typography.Text>
                {isActive ? (
                  <Tag color="success">Gemini Pro 会员使用中</Tag>
                ) : (
                  <Tag color="default">会员已过期</Tag>
                )}
              </Space>
              <Typography.Text type="secondary" style={{ display: "block" }}>
                北京时间：{formatUnixSeconds(statusData.now)}
              </Typography.Text>
            </div>

            <Card size="small">
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Statistic
                  title="剩余天数"
                  value={statusData.user.remainingDays}
                  suffix="天"
                  valueStyle={{
                    color: isExpiringSoon
                      ? "#dc2626"
                      : isActive
                        ? "#047857"
                        : "#64748b",
                    fontWeight: 700,
                  }}
                />
                <Typography.Text type="secondary">
                  有效期至：{formatUnixSeconds(statusData.user.expireAt)}
                </Typography.Text>
                <Typography.Text type="secondary">
                  已使用 {statusData.user.usedDays} 天
                </Typography.Text>
              </Space>
            </Card>

            <Card size="small" title="邀请奖励">
              <Space
                wrap
                size={[24, 16]}
                style={{ width: "100%", marginBottom: 12 }}
              >
                <Statistic
                  title="已邀请人数"
                  value={statusData.referral.inviteeCount}
                  suffix="人"
                />
                <Statistic
                  title="预计奖励"
                  value={statusData.referral.pendingRewardAmount}
                  precision={2}
                  prefix="¥"
                />
                <Statistic
                  title="可提现"
                  value={statusData.referral.availableRewardAmount}
                  precision={2}
                  prefix="¥"
                />
                <Statistic
                  title="已提现"
                  value={statusData.referral.withdrawnRewardAmount}
                  precision={2}
                  prefix="¥"
                />
              </Space>
              <Typography.Text type="secondary" style={{ display: "block" }}>
                结算说明：单笔充值到期后预计奖励转为可提现；若该笔发生退款，奖励会失效。
              </Typography.Text>

              {statusData.referral.invitees.length > 0 ? (
                <Space
                  direction="vertical"
                  size={8}
                  style={{ width: "100%", marginTop: 12 }}
                >
                  {statusData.referral.invitees.map((invitee) => (
                    <Card
                      key={invitee.inviteeUserId}
                      size="small"
                      style={{ backgroundColor: "#fafafa" }}
                    >
                      <Space
                        direction="vertical"
                        size={4}
                        style={{ width: "100%" }}
                      >
                        <Typography.Text strong>
                          {invitee.inviteeUsername}
                        </Typography.Text>
                        <Space wrap size={8}>
                          <Tag color="orange">
                            预计 {formatCurrency(invitee.pendingRewardAmount)}
                          </Tag>
                          <Tag color="green">
                            可提现 {formatCurrency(invitee.availableRewardAmount)}
                          </Tag>
                          <Tag color="blue">
                            已提现 {formatCurrency(invitee.withdrawnRewardAmount)}
                          </Tag>
                          <Tag>
                            累计 {formatCurrency(invitee.totalRewardAmount)}
                          </Tag>
                        </Space>
                      </Space>
                    </Card>
                  ))}
                </Space>
              ) : (
                <Empty
                  style={{ marginTop: 12 }}
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="暂无邀请奖励记录"
                />
              )}
            </Card>

            {isExpiringSoon ? (
              <Alert
                type="warning"
                showIcon
                message={`剩余 ${statusData.user.remainingDays} 天，请及时续费。`}
              />
            ) : null}
            {!isActive ? (
              <Alert
                type="error"
                showIcon
                message="当前会员已过期，请联系管理员充值后再使用。"
              />
            ) : null}
          </Space>
        ) : null}
      </Card>

      <Card className="status-history-card" title="变动历史" bordered={false}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : statusData && statusData.history.length > 0 ? (
          <Timeline
            items={statusData.history.map((item) => {
              const reasonVisual = getHistoryReasonVisual(item.reason);
              const reasonText = REASON_LABELS[item.reason] || item.reason;

              return {
                color: reasonVisual.timelineColor,
                children: (
                  <Space direction="vertical" size={0}>
                    <Space wrap size={8} className="status-history-summary">
                      <Tag
                        className="status-history-reason-tag"
                        style={reasonVisual.reasonTagStyle}
                      >
                        {reasonText}
                      </Tag>
                      <Typography.Text style={reasonVisual.changeDaysStyle}>
                        {formatHistoryChangeDays(item)}
                      </Typography.Text>
                    </Space>
                    {item.externalNote ? (
                      <Typography.Text type="secondary">
                        {item.externalNote}
                      </Typography.Text>
                    ) : null}
                    <Typography.Text type="secondary">
                      {formatUnixSeconds(item.createdAt)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      到期变更：{formatUnixSeconds(item.expireBefore)} →{" "}
                      {formatUnixSeconds(item.expireAfter)}
                    </Typography.Text>
                  </Space>
                ),
              };
            })}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无变动记录"
          />
        )}
      </Card>
    </main>
  );
};

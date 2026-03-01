import { useEffect, useMemo, useState } from "react";
import {
  MembershipStatus,
  RechargeReason,
  type UserStatusHistoryRecordDTO,
  type UserStatusResponseDTO
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
  Typography
} from "antd";
import { useLocation, useParams } from "react-router-dom";

import { apiRequest, ApiRequestError } from "../api/client";

const REASON_LABELS: Record<RechargeReason, string> = {
  [RechargeReason.WECHAT_PAY]: "微信支付",
  [RechargeReason.ALIPAY]: "支付宝支付",
  [RechargeReason.CAMPAIGN_GIFT]: "活动赠送",
  [RechargeReason.AFTER_SALES]: "售后补偿",
  [RechargeReason.MANUAL_FIX]: "手动修正"
};

const formatUnixSeconds = (value: number) => {
  if (value <= 0) {
    return "未设置";
  }

  return new Date(value * 1000).toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai"
  });
};

const formatHistoryItem = (record: UserStatusHistoryRecordDTO): string => {
  const reasonText = REASON_LABELS[record.reason] || record.reason;
  return `${reasonText} | +${record.changeDays} 天`;
};

export const StatusShellPage = () => {
  const { token } = useParams<{ token: string }>();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusData, setStatusData] = useState<UserStatusResponseDTO | null>(null);

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
            method: "GET"
          }
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
          setErrorMessage(error instanceof Error ? error.message : "状态加载失败，请稍后重试。");
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
                你好，{statusData.user.remarkName}
              </Typography.Title>
              <Space wrap>
                {isActive ? (
                  <Tag color="success">VIP 会员中</Tag>
                ) : (
                  <Tag color="default">会员已过期</Tag>
                )}
                <Typography.Text type="secondary">
                  北京时间：{formatUnixSeconds(statusData.now)}
                </Typography.Text>
              </Space>
            </div>

            <Card size="small">
              <Space direction="vertical" size={8} style={{ width: "100%" }}>
                <Statistic
                  title="剩余天数"
                  value={statusData.user.remainingDays}
                  suffix="天"
                  valueStyle={{
                    color: isExpiringSoon ? "#dc2626" : isActive ? "#047857" : "#64748b",
                    fontWeight: 700
                  }}
                />
                <Typography.Text type="secondary">
                  有效期至：{formatUnixSeconds(statusData.user.expireAt)}
                </Typography.Text>
              </Space>
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

      <Card className="status-history-card" title="变动历史（倒序）" bordered={false}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : statusData && statusData.history.length > 0 ? (
          <Timeline
            items={statusData.history.map((item) => ({
              color: "green",
              children: (
                <Space direction="vertical" size={0}>
                  <Typography.Text>{formatHistoryItem(item)}</Typography.Text>
                  <Typography.Text type="secondary">
                    {formatUnixSeconds(item.createdAt)}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    到期变更：{formatUnixSeconds(item.expireBefore)} → {formatUnixSeconds(item.expireAfter)}
                  </Typography.Text>
                </Space>
              )
            }))}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无变动记录" />
        )}
      </Card>
    </main>
  );
};

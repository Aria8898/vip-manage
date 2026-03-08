import { useEffect, useState } from "react";
import { Modal, Tag, Typography } from "antd";
import wx from "../../img/wx.jpg";
type ContactServiceModalProps = {
  open: boolean;
  onClose: () => void;
  productName?: string | null;
  qrCodeSrc?: string | null;
};

const toolItems = [
  { label: "ChatGPT Pro", color: "green" as const },
  { label: "Cursor", color: "blue" as const },
  { label: "Claude", color: "orange" as const },
  { label: "Gemini", color: "purple" as const },
];

export default function ContactServiceModal({
  open,
  onClose,
  productName,
  qrCodeSrc = wx,
}: ContactServiceModalProps) {
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    if (open) {
      setImageLoadError(false);
    }
  }, [open, qrCodeSrc]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={380}
      title="联系客服"
    >
      <div className="contact-service-modal">
        <div className="contact-service-panel">
          <div className="contact-service-panel-header">
            <span className="contact-service-panel-badge" aria-hidden="true">
              ✦
            </span>
            <Typography.Text strong className="contact-service-panel-title">
              AI 工具充值服务
            </Typography.Text>
          </div>

          <Typography.Paragraph className="contact-service-panel-description">
            支持充值多种 AI 工具，遇到开通、续费或到账问题都可以联系人工处理。
          </Typography.Paragraph>

          <div className="contact-service-tag-list">
            {toolItems.map((item) => (
              <Tag key={item.label} color={item.color} bordered={false}>
                {item.label}
              </Tag>
            ))}
          </div>
        </div>

        <Typography.Paragraph className="contact-service-copy">
          添加客服微信（aixzl186）获取专业帮助。
        </Typography.Paragraph>

        {productName ? (
          <Typography.Text type="secondary">
            当前商品：{productName}
          </Typography.Text>
        ) : null}

        <div className="contact-service-qr-wrapper">
          {qrCodeSrc && !imageLoadError ? (
            <img
              src={qrCodeSrc}
              alt="客服微信二维码"
              className="contact-service-qr-image"
              onError={() => setImageLoadError(true)}
            />
          ) : (
            <div className="contact-service-qr-placeholder">
              请补充客服二维码图片
            </div>
          )}
        </div>

        <div className="contact-service-note">
          <Typography.Text>
            添加时请备注来意，例如：Gemini 续费、账号充值、到账异常。
          </Typography.Text>
        </div>
      </div>
    </Modal>
  );
}

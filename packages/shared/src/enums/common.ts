export enum MembershipStatus {
  ACTIVE = "active",
  EXPIRED = "expired"
}

export enum RechargeReason {
  WECHAT_PAY = "wechat_pay",
  ALIPAY = "alipay",
  PLATFORM_ORDER = "platform_order",
  REFERRAL_REWARD = "referral_reward",
  CAMPAIGN_GIFT = "campaign_gift",
  AFTER_SALES = "after_sales",
  MANUAL_FIX = "manual_fix"
}

export enum RechargeRecordSource {
  NORMAL = "normal",
  BACKFILL = "backfill",
  SYSTEM_BONUS = "system_bonus",
  REFUND_ROLLBACK = "refund_rollback"
}

export enum UserProfileChangeField {
  SYSTEM_EMAIL = "systemEmail",
  FAMILY_GROUP_NAME = "familyGroupName",
  USER_EMAIL = "userEmail"
}

export enum ReferralRewardStatus {
  PENDING = "pending",
  AVAILABLE = "available",
  CANCELED = "canceled",
  WITHDRAWN = "withdrawn"
}

export enum ReferralBonusStatus {
  PENDING = "pending",
  GRANTED = "granted",
  REVOKED = "revoked"
}

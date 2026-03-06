import type {
  InviteRewardMode,
  MembershipStatus,
  ReferralBonusStatus,
  ReferralRewardStatus,
  RechargeReason,
  RechargeRecordSource,
  UserProfileChangeField
} from "../enums/common";

export interface HealthDTO {
  status: "ok";
  timestamp: number;
  environment: string;
}

export interface AdminLoginRequestDTO {
  username: string;
  password: string;
}

export interface AdminLoginResponseDTO {
  adminId: string;
  username: string;
  expiresAt: number;
}

export interface AdminSessionDTO {
  adminId: string;
  username: string;
  expiresAt: number;
}

export interface UserSummaryDTO {
  id: string;
  username: string;
  expireAt: number;
}

export interface AdminCreateUserRequestDTO {
  username: string;
  systemEmail?: string;
  familyGroupName?: string;
  userEmail?: string;
  inviterCode?: string;
  inviterUserId?: string;
}

export interface AdminUserDTO extends UserSummaryDTO {
  systemEmail: string | null;
  familyGroupName: string | null;
  userEmail: string | null;
  systemInviteCode?: string | null;
  customInviteCode?: string | null;
  createdAt: number;
  updatedAt: number;
  tokenVersion: number;
  statusToken: string;
  inviterUserId?: string | null;
  inviterUsername?: string | null;
  inviteeCount?: number;
  pendingRewardAmount?: number;
  availableRewardAmount?: number;
  rewardDebtAmount?: number;
  grossAvailableRewardAmount?: number;
  netWithdrawableAmount?: number;
  referralRewardEligible?: boolean;
}

export interface AdminCreateUserResponseDTO {
  user: AdminUserDTO;
}

export interface AdminListUsersResponseDTO {
  items: AdminUserDTO[];
  query: string;
}

export interface AdminUpdateUserRequestDTO {
  username: string;
  systemEmail?: string;
  familyGroupName?: string;
  userEmail?: string;
  changeNotes?: Partial<Record<UserProfileChangeField, string>>;
}

export interface AdminUpdateUserResponseDTO {
  user: AdminUserDTO;
}

export interface AdminUserProfileChangeRecordDTO {
  id: string;
  changeBatchId: string;
  userId: string;
  username: string;
  field: UserProfileChangeField;
  beforeValue: string | null;
  afterValue: string | null;
  changeNote: string;
  operatorAdminId: string;
  operatorAdminUsername: string;
  createdAt: number;
}

export interface AdminListUserProfileChangeLogsResponseDTO {
  items: AdminUserProfileChangeRecordDTO[];
  limit: number;
}

export interface AdminRechargeUserRequestDTO {
  days: number;
  reason: RechargeReason;
  paymentAmount: number;
  internalNote?: string;
  externalNote?: string;
}

export interface AdminRechargeRecordDTO {
  id: string;
  userId: string;
  username: string;
  changeDays: number;
  reason: RechargeReason;
  paymentAmount: number;
  internalNote: string | null;
  externalNote: string | null;
  expireBefore: number;
  expireAfter: number;
  operatorAdminId: string;
  operatorAdminUsername: string;
  occurredAt: number;
  recordedAt: number;
  source: RechargeRecordSource;
  refundedAt: number | null;
  refundedByAdminId: string | null;
  refundAmount: number;
  refundNote: string | null;
  createdAt: number;
}

export interface AdminRechargeUserResponseDTO {
  user: UserSummaryDTO & {
    updatedAt: number;
  };
  record: AdminRechargeRecordDTO;
}

export interface AdminBackfillRechargeRequestDTO {
  days: number;
  reason: RechargeReason;
  paymentAmount: number;
  occurredAt: number;
  grantReferralReward?: boolean;
  internalNote?: string;
  externalNote?: string;
}

export interface AdminListRechargeRecordsResponseDTO {
  items: AdminRechargeRecordDTO[];
  limit: number;
}

export interface AdminRefundRechargeRequestDTO {
  refundAmount?: number;
  refundNote?: string;
}

export interface AdminRefundRechargeResponseDTO {
  user: UserSummaryDTO & {
    updatedAt: number;
  };
  originalRecord: AdminRechargeRecordDTO;
  refundRecord: AdminRechargeRecordDTO;
}

export interface AdminBindUserReferralRequestDTO {
  inviterCode?: string;
  inviterUserId?: string;
}

export interface AdminBindUserReferralResponseDTO {
  inviterUserId: string;
  inviteeUserId: string;
  boundAt: number;
}

export interface AdminUpdateUserInviteCodeRequestDTO {
  customInviteCode?: string;
}

export interface AdminUpdateUserInviteCodeResponseDTO {
  user: AdminUserDTO;
}

export interface AdminUpdateReferralRewardEligibilityRequestDTO {
  referralRewardEligible: boolean;
}

export interface AdminUpdateReferralRewardEligibilityResponseDTO {
  user: AdminUserDTO;
}

export interface AdminReferralRewardRecordDTO {
  id: string;
  inviterUserId: string;
  inviterUsername: string;
  inviteeUserId: string;
  inviteeUsername: string;
  rechargeRecordId: string;
  rechargeReason: RechargeReason;
  rechargeSource: RechargeRecordSource;
  paymentAmount: number;
  rewardRateBps: number;
  rewardAmount: number;
  unlockedRewardAmount: number;
  withdrawableRewardAmount: number;
  withdrawnRewardAmount: number;
  totalDays: number;
  unlockedDays: number;
  status: ReferralRewardStatus;
  unlockAt: number;
  availableAt: number | null;
  canceledAt: number | null;
  canceledReason: string | null;
  withdrawnAt: number | null;
  withdrawalId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface AdminListReferralRewardsResponseDTO {
  items: AdminReferralRewardRecordDTO[];
  limit: number;
  status: ReferralRewardStatus | "all";
}

export interface AdminReferralWithdrawalDTO {
  id: string;
  inviterUserId: string;
  inviterUsername: string;
  amount: number;
  grossAmount: number;
  debtOffsetAmount: number;
  processedByAdminId: string;
  processedByAdminUsername: string;
  note: string | null;
  createdAt: number;
}

export interface AdminListReferralWithdrawalsResponseDTO {
  items: AdminReferralWithdrawalDTO[];
  limit: number;
}

export type RefundRepairTaskStatus = "pending" | "resolved";

export type RefundRepairTaskStep =
  | "rollback"
  | "referral"
  | "bonus"
  | "mark_refund"
  | "resolved";

export interface AdminRefundRepairTaskDTO {
  id: string;
  rechargeRecordId: string;
  rollbackRecordId: string | null;
  userId: string;
  username: string;
  refundAmount: number;
  refundNote: string | null;
  refundedAt: number | null;
  status: RefundRepairTaskStatus;
  currentStep: RefundRepairTaskStep;
  lastError: string;
  retryCount: number;
  rollbackAppliedAt: number | null;
  referralAdjustedAt: number | null;
  bonusRevokedAt: number | null;
  refundMarkedAt: number | null;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

export interface AdminListRefundRepairTasksResponseDTO {
  items: AdminRefundRepairTaskDTO[];
  limit: number;
  status: RefundRepairTaskStatus | "all";
}

export interface AdminRetryRefundRepairTaskResponseDTO {
  task: AdminRefundRepairTaskDTO;
  user: UserSummaryDTO & {
    updatedAt: number;
  };
  originalRecord: AdminRechargeRecordDTO;
  refundRecord: AdminRechargeRecordDTO;
}

export type AdminAlertSeverity = "warning" | "error";

export type AdminAlertStatus = "open" | "acknowledged";

export interface AdminAlertEventDTO {
  id: string;
  severity: AdminAlertSeverity;
  status: AdminAlertStatus;
  category: string;
  title: string;
  message: string;
  requestId: string | null;
  dedupeKey: string | null;
  detailJson: string | null;
  occurrenceCount: number;
  createdAt: number;
  updatedAt: number;
  lastOccurredAt: number;
  acknowledgedAt: number | null;
  acknowledgedByAdminId: string | null;
}

export interface AdminListAlertEventsResponseDTO {
  items: AdminAlertEventDTO[];
  limit: number;
  status: AdminAlertStatus | "all";
  severity: AdminAlertSeverity | "all";
}

export interface AdminAcknowledgeAlertEventResponseDTO {
  alert: AdminAlertEventDTO;
}

export interface AdminWithdrawReferralRewardsRequestDTO {
  inviterUserId: string;
  note?: string;
}

export interface AdminWithdrawReferralRewardsResponseDTO {
  withdrawal: AdminReferralWithdrawalDTO;
  withdrawnCount: number;
  withdrawnAmount: number;
  grossAmount: number;
  debtOffsetAmount: number;
}

export interface AdminReferralDashboardDTO {
  pendingAmount: number;
  availableAmount: number;
  withdrawnAmount: number;
  grossAvailableAmount: number;
  debtAmount: number;
  withdrawThresholdAmount: number;
  pendingCount: number;
  availableCount: number;
  inviteRewardMode?: InviteRewardMode;
}

export interface AdminReferralBonusGrantDTO {
  id: string;
  inviteeUserId: string;
  triggerRechargeRecordId: string;
  bonusRechargeRecordId: string;
  bonusDays: number;
  status: ReferralBonusStatus;
  revokedAt: number | null;
  revokeRechargeRecordId: string | null;
  createdAt: number;
}

export interface AdminDashboardTodayDTO {
  dayStartAt: number;
  dayEndAt: number;
  rechargeCount: number;
  totalChangeDays: number;
}

export interface AdminResetUserTokenResponseDTO {
  user: AdminUserDTO;
}

export interface UserStatusHistoryRecordDTO {
  id: string;
  changeDays: number;
  reason: RechargeReason;
  paymentAmount: number;
  externalNote: string | null;
  expireBefore: number;
  expireAfter: number;
  createdAt: number;
}

export interface UserStatusDTO extends UserSummaryDTO {
  status: MembershipStatus;
  remainingDays: number;
  usedDays: number;
  userEmail: string | null;
}

export interface UserInviteeRewardSummaryDTO {
  inviteeUserId: string;
  inviteeUsername: string;
  pendingRewardAmount: number;
  availableRewardAmount: number;
  withdrawnRewardAmount: number;
  totalRewardAmount: number;
}

export interface UserReferralSummaryDTO {
  inviteeCount: number;
  pendingRewardAmount: number;
  availableRewardAmount: number;
  withdrawnRewardAmount: number;
  totalRewardAmount: number;
  rewardDebtAmount: number;
  netWithdrawableAmount: number;
  invitees: UserInviteeRewardSummaryDTO[];
}

export interface UserStatusResponseDTO {
  user: UserStatusDTO;
  history: UserStatusHistoryRecordDTO[];
  referral: UserReferralSummaryDTO;
  capabilities: {
    inviteRewardMode: InviteRewardMode;
    referralRewardEligible: boolean;
    canViewReferralReward: boolean;
  };
  now: number;
}

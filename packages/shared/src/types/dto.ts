import type {
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
  inviterUserId?: string;
}

export interface AdminUserDTO extends UserSummaryDTO {
  systemEmail: string | null;
  familyGroupName: string | null;
  userEmail: string | null;
  createdAt: number;
  updatedAt: number;
  tokenVersion: number;
  statusToken: string;
  inviterUserId?: string | null;
  inviterUsername?: string | null;
  inviteeCount?: number;
  pendingRewardAmount?: number;
  availableRewardAmount?: number;
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
  inviterUserId: string;
}

export interface AdminBindUserReferralResponseDTO {
  inviterUserId: string;
  inviteeUserId: string;
  boundAt: number;
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
  processedByAdminId: string;
  processedByAdminUsername: string;
  note: string | null;
  createdAt: number;
}

export interface AdminListReferralWithdrawalsResponseDTO {
  items: AdminReferralWithdrawalDTO[];
  limit: number;
}

export interface AdminWithdrawReferralRewardsRequestDTO {
  inviterUserId: string;
  note?: string;
}

export interface AdminWithdrawReferralRewardsResponseDTO {
  withdrawal: AdminReferralWithdrawalDTO;
  withdrawnCount: number;
  withdrawnAmount: number;
}

export interface AdminReferralDashboardDTO {
  pendingAmount: number;
  availableAmount: number;
  withdrawnAmount: number;
  pendingCount: number;
  availableCount: number;
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

export interface UserStatusResponseDTO {
  user: UserStatusDTO;
  history: UserStatusHistoryRecordDTO[];
  now: number;
}

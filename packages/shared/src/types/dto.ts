import type {
  MembershipStatus,
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
}

export interface AdminUserDTO extends UserSummaryDTO {
  systemEmail: string | null;
  familyGroupName: string | null;
  userEmail: string | null;
  createdAt: number;
  updatedAt: number;
  tokenVersion: number;
  statusToken: string;
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
}

export interface AdminRechargeRecordDTO {
  id: string;
  userId: string;
  username: string;
  changeDays: number;
  reason: RechargeReason;
  paymentAmount: number;
  internalNote: string | null;
  expireBefore: number;
  expireAfter: number;
  operatorAdminId: string;
  operatorAdminUsername: string;
  occurredAt: number;
  recordedAt: number;
  source: RechargeRecordSource;
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
}

export interface AdminListRechargeRecordsResponseDTO {
  items: AdminRechargeRecordDTO[];
  limit: number;
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

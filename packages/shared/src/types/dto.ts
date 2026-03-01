import type { RechargeReason } from "../enums/common";

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
  remarkName: string;
  expireAt: number;
}

export interface AdminCreateUserRequestDTO {
  remarkName: string;
}

export interface AdminUserDTO extends UserSummaryDTO {
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

export interface AdminRechargeUserRequestDTO {
  days: number;
  reason: RechargeReason;
  internalNote?: string;
}

export interface AdminRechargeRecordDTO {
  id: string;
  userId: string;
  userRemarkName: string;
  changeDays: number;
  reason: RechargeReason;
  internalNote: string | null;
  expireBefore: number;
  expireAfter: number;
  operatorAdminId: string;
  operatorAdminUsername: string;
  createdAt: number;
}

export interface AdminRechargeUserResponseDTO {
  user: UserSummaryDTO & {
    updatedAt: number;
  };
  record: AdminRechargeRecordDTO;
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

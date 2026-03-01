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

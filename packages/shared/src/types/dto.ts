export interface HealthDTO {
  status: "ok";
  timestamp: number;
  environment: string;
}

export interface UserSummaryDTO {
  id: string;
  remarkName: string;
  expireAt: number;
}

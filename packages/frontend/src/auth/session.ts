import type { AdminSessionDTO } from "@vip/shared";

import { apiRequest } from "../api/client";

export const fetchAdminSession = async (): Promise<AdminSessionDTO> => {
  const response = await apiRequest<AdminSessionDTO>("/admin/session");
  return response.data;
};


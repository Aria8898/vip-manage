import { API_PREFIX, type ApiResponse } from "@vip/shared";

const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL || API_PREFIX;

interface RequestOptions extends RequestInit {
  query?: Record<string, string | number | boolean | undefined>;
}

export class ApiRequestError extends Error {
  status: number;
  code?: number;
  requestId?: string;

  constructor(message: string, status: number, code?: number, requestId?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

const buildUrl = (path: string, query?: RequestOptions["query"]): string => {
  const url = new URL(`${DEFAULT_BASE}${path}`, window.location.origin);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) {
        continue;
      }
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
};

export const apiRequest = async <T>(
  path: string,
  options: RequestOptions = {}
): Promise<ApiResponse<T>> => {
  const requestUrl = buildUrl(path, options.query);
  const response = await fetch(requestUrl, {
    credentials: options.credentials ?? "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;

  if (!response.ok || !payload || payload.code !== 0) {
    throw new ApiRequestError(
      payload?.message || `Request failed: ${response.status}`,
      response.status,
      payload?.code,
      payload?.requestId
    );
  }

  return payload;
};

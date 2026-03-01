import { API_PREFIX, type ApiResponse } from "@vip/shared";

const DEFAULT_BASE = import.meta.env.VITE_API_BASE_URL || API_PREFIX;

interface RequestOptions extends RequestInit {
  query?: Record<string, string | number | boolean | undefined>;
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
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as ApiResponse<T>;
};

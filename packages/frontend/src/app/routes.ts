export type AppKind = "admin" | "status";

const normalizeBasePath = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailingSlash =
    normalized.length > 1 ? normalized.replace(/\/+$/u, "") : normalized;

  return withoutTrailingSlash || fallback;
};

const joinPath = (basePath: string, childPath: string): string => {
  const normalizedChild = childPath.replace(/^\/+/u, "");
  return `${basePath}/${normalizedChild}`;
};
export const ADMIN_BASE_PATH = normalizeBasePath(
  import.meta.env.VITE_ADMIN_BASE_PATH,
  "/admin"
);
export const STATUS_BASE_PATH = normalizeBasePath(
  import.meta.env.VITE_STATUS_BASE_PATH,
  "/status"
);

export const ADMIN_ROUTES = {
  home: ADMIN_BASE_PATH,
  login: joinPath(ADMIN_BASE_PATH, "login"),
  referralRewards: joinPath(ADMIN_BASE_PATH, "referral-rewards"),
  referralWithdrawals: joinPath(ADMIN_BASE_PATH, "referral-withdrawals"),
  refundRepairTasks: joinPath(ADMIN_BASE_PATH, "refund-repair-tasks"),
  alertEvents: joinPath(ADMIN_BASE_PATH, "alert-events"),
} as const;

export const STATUS_ROUTES = {
  home: STATUS_BASE_PATH,
  detail: joinPath(STATUS_BASE_PATH, ":token"),
} as const;

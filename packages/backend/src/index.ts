import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import {
  MembershipStatus,
  RechargeReason,
  RechargeRecordSource,
  UserProfileChangeField,
  type AdminBackfillRechargeRequestDTO,
  type AdminCreateUserRequestDTO,
  type AdminCreateUserResponseDTO,
  type AdminDashboardTodayDTO,
  type AdminListUserProfileChangeLogsResponseDTO,
  type AdminListRechargeRecordsResponseDTO,
  type AdminResetUserTokenResponseDTO,
  type AdminListUsersResponseDTO,
  type AdminLoginRequestDTO,
  type AdminLoginResponseDTO,
  type AdminRechargeRecordDTO,
  type AdminRechargeUserRequestDTO,
  type AdminRechargeUserResponseDTO,
  type AdminSessionDTO,
  type AdminUpdateUserRequestDTO,
  type AdminUpdateUserResponseDTO,
  type AdminUserDTO,
  type AdminUserProfileChangeRecordDTO,
  type ApiResponse,
  type HealthDTO,
  type UserStatusHistoryRecordDTO,
  type UserStatusResponseDTO
} from "@vip/shared";

import { createRequestId } from "./lib/request-id";
import {
  checkLoginLimit,
  clearLoginLimit,
  recordFailedLogin
} from "./lib/login-failure-rate-limit";
import { verifyPasswordHash } from "./lib/password-hash";

type Bindings = {
  DB: D1Database;
  APP_ENV?: string;
  JWT_SECRET?: string;
  USER_TOKEN_SECRET?: string;
  ADMIN_SESSION_TTL_SECONDS?: string;
};

type AdminSessionContext = {
  adminId: string;
  username: string;
  expiresAt: number;
};

type Variables = {
  requestId: string;
  adminSession: AdminSessionContext;
};

const ADMIN_SESSION_COOKIE = "vip_admin_session";
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_USER_TOKEN_VERSION = 1;
const DEFAULT_RECHARGE_RECORD_LIMIT = 100;
const MAX_RECHARGE_RECORD_LIMIT = 200;
const DEFAULT_PROFILE_CHANGE_LOG_LIMIT = 100;
const MAX_PROFILE_CHANGE_LOG_LIMIT = 200;
const DEFAULT_STATUS_HISTORY_LIMIT = 50;
const USER_LIST_LIMIT = 100;
const MAX_USERNAME_LENGTH = 80;
const MAX_FAMILY_GROUP_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 120;
const MAX_INTERNAL_NOTE_LENGTH = 200;
const MAX_PROFILE_CHANGE_NOTE_LENGTH = 200;
const MAX_RECHARGE_DAYS = 3650;
const MAX_PAYMENT_AMOUNT = 1000000;
const SECONDS_PER_DAY = 24 * 60 * 60;
const UTC8_OFFSET_SECONDS = 8 * 60 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
type HttpStatus = 200 | 400 | 401 | 404 | 429 | 500;

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
}

interface UserRow {
  id: string;
  username: string;
  system_email?: string | null;
  family_group_name?: string | null;
  user_email?: string | null;
  expire_at: number;
  created_at: number;
  updated_at: number;
  token_version?: number;
}

interface SqliteTableInfoRow {
  name: string;
}

interface RechargeTargetUserRow {
  id: string;
  username: string;
  expire_at: number;
  updated_at?: number;
}

interface RechargeRecordRow {
  id: string;
  user_id: string;
  username: string;
  change_days: number;
  reason: string;
  payment_amount_cents: number | null;
  internal_note: string | null;
  expire_before: number;
  expire_after: number;
  operator_admin_id: string;
  operator_admin_username: string;
  occurred_at: number | null;
  recorded_at: number | null;
  source: string | null;
  created_at: number;
}

interface UserProfileChangeLogRow {
  id: string;
  change_batch_id: string;
  user_id: string;
  username: string;
  field_name: string;
  before_value: string | null;
  after_value: string | null;
  change_note: string;
  operator_admin_id: string;
  operator_admin_username: string;
  created_at: number;
}

interface DashboardTodayRow {
  recharge_count: number | string | null;
  total_change_days: number | string | null;
}

interface UserTotalChangeDaysRow {
  total_change_days: number | string | null;
}

interface RechargeRebuildRow {
  id: string;
  change_days: number;
  occurred_at: number;
  expire_before: number;
  expire_after: number;
}

interface UserStatusRow {
  id: string;
  username: string;
  expire_at: number;
}

interface UserStatusHistoryRow {
  id: string;
  change_days: number;
  reason: string;
  expire_before: number;
  expire_after: number;
  occurred_at: number | null;
  created_at: number;
}

interface ResetTokenTargetUserRow {
  id: string;
  username: string;
  system_email?: string | null;
  family_group_name?: string | null;
  user_email?: string | null;
  expire_at: number;
  created_at: number;
  token_version: number;
  access_token_hash: string;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
let cachedHasUsersTokenVersionColumn: boolean | null = null;
let cachedHasUsersExtraProfileColumns: boolean | null = null;
let cachedHasRechargeTimelineColumns: boolean | null = null;

const getCurrentTimestamp = (): number => Math.floor(Date.now() / 1000);

const parseSessionTtlSeconds = (value: string | undefined): number => {
  const fallback = DEFAULT_SESSION_TTL_SECONDS;
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const getClientIp = (request: Request): string => {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim() || "unknown";
  }

  return "unknown";
};

const shouldUseSecureCookie = (request: Request, env: Bindings): boolean => {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.toLowerCase().includes("https");
  }

  if (request.url.startsWith("https://")) {
    return true;
  }

  return env.APP_ENV === "production";
};

const getJwtSecret = (env: Bindings): string | null => {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    return null;
  }
  return env.JWT_SECRET;
};

const getUserTokenSecret = (env: Bindings): string | null => {
  if (env.USER_TOKEN_SECRET && env.USER_TOKEN_SECRET.length >= 32) {
    return env.USER_TOKEN_SECRET;
  }

  return getJwtSecret(env);
};

const toBase64Url = (input: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < input.length; index += 1) {
    binary += String.fromCharCode(input[index] as number);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const encodeUtf8Base64Url = (input: string): string => {
  const encoded = new TextEncoder().encode(input);
  return toBase64Url(encoded);
};

const hmacSha256 = async (secret: string, data: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return new Uint8Array(signature);
};

const sha256Hex = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

const buildUserStatusToken = async (
  userId: string,
  tokenVersion: number,
  secret: string
): Promise<string> => {
  const payload = `uid:${userId}:v:${tokenVersion}`;
  const payloadBase64 = encodeUtf8Base64Url(payload);
  const signature = await hmacSha256(secret, payloadBase64);
  const signatureBase64 = toBase64Url(signature);

  return `${payloadBase64}.${signatureBase64}`;
};

const toAdminUserDTO = async (
  row: UserRow,
  tokenSecret: string
): Promise<AdminUserDTO> => {
  const tokenVersion = row.token_version ?? DEFAULT_USER_TOKEN_VERSION;
  const statusToken = await buildUserStatusToken(row.id, tokenVersion, tokenSecret);

  return {
    id: row.id,
    username: row.username,
    systemEmail: row.system_email ?? null,
    familyGroupName: row.family_group_name ?? null,
    userEmail: row.user_email ?? null,
    expireAt: row.expire_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tokenVersion,
    statusToken
  };
};

const hasUsersTokenVersionColumn = async (db: D1Database): Promise<boolean> => {
  if (cachedHasUsersTokenVersionColumn !== null) {
    return cachedHasUsersTokenVersionColumn;
  }

  const rows = await db.prepare("PRAGMA table_info(users)").all<SqliteTableInfoRow>();
  const hasColumn = (rows.results || []).some((row) => row.name === "token_version");
  cachedHasUsersTokenVersionColumn = hasColumn;

  return hasColumn;
};

const hasUsersExtraProfileColumns = async (db: D1Database): Promise<boolean> => {
  if (cachedHasUsersExtraProfileColumns !== null) {
    return cachedHasUsersExtraProfileColumns;
  }

  const rows = await db.prepare("PRAGMA table_info(users)").all<SqliteTableInfoRow>();
  const columnNames = new Set((rows.results || []).map((row) => row.name));
  const hasColumns =
    columnNames.has("system_email") &&
    columnNames.has("family_group_name") &&
    columnNames.has("user_email");
  cachedHasUsersExtraProfileColumns = hasColumns;

  return hasColumns;
};

const hasRechargeTimelineColumns = async (db: D1Database): Promise<boolean> => {
  if (cachedHasRechargeTimelineColumns !== null) {
    return cachedHasRechargeTimelineColumns;
  }

  const rows = await db.prepare("PRAGMA table_info(recharge_records)").all<SqliteTableInfoRow>();
  const columnNames = new Set((rows.results || []).map((row) => row.name));
  const hasColumns =
    columnNames.has("occurred_at") &&
    columnNames.has("recorded_at") &&
    columnNames.has("source") &&
    columnNames.has("payment_amount_cents");
  cachedHasRechargeTimelineColumns = hasColumns;

  return hasColumns;
};

const normalizeInternalNote = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const normalizeProfileChangeNote = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const normalizePaymentAmount = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(2));
};

const toPaymentAmountCents = (value: number): number => Math.round(value * 100);

const toPaymentAmount = (value: number | null | undefined): number => {
  const cents = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Number((Math.max(cents, 0) / 100).toFixed(2));
};

const isUserProfileChangeField = (value: string): value is UserProfileChangeField => {
  return (
    value === UserProfileChangeField.SYSTEM_EMAIL ||
    value === UserProfileChangeField.FAMILY_GROUP_NAME ||
    value === UserProfileChangeField.USER_EMAIL
  );
};

const toUserProfileChangeField = (value: string): UserProfileChangeField =>
  isUserProfileChangeField(value)
    ? value
    : UserProfileChangeField.SYSTEM_EMAIL;

const isRechargeReason = (value: string): value is RechargeReason => {
  return (
    value === RechargeReason.WECHAT_PAY ||
    value === RechargeReason.ALIPAY ||
    value === RechargeReason.CAMPAIGN_GIFT ||
    value === RechargeReason.AFTER_SALES ||
    value === RechargeReason.MANUAL_FIX
  );
};

const toRechargeReason = (value: string): RechargeReason =>
  isRechargeReason(value) ? value : RechargeReason.MANUAL_FIX;

const toRechargeRecordSource = (value: string | null | undefined): RechargeRecordSource =>
  value === RechargeRecordSource.BACKFILL
    ? RechargeRecordSource.BACKFILL
    : RechargeRecordSource.NORMAL;

const toOccurredAt = (row: {
  occurred_at: number | null;
  created_at: number;
}): number => (row.occurred_at && row.occurred_at > 0 ? row.occurred_at : row.created_at);

const toRecordedAt = (row: {
  recorded_at: number | null;
  created_at: number;
}): number => (row.recorded_at && row.recorded_at > 0 ? row.recorded_at : row.created_at);

const toAdminRechargeRecordDTO = (row: RechargeRecordRow): AdminRechargeRecordDTO => ({
  id: row.id,
  userId: row.user_id,
  username: row.username,
  changeDays: row.change_days,
  reason: toRechargeReason(row.reason),
  paymentAmount: toPaymentAmount(row.payment_amount_cents),
  internalNote: row.internal_note,
  expireBefore: row.expire_before,
  expireAfter: row.expire_after,
  operatorAdminId: row.operator_admin_id,
  operatorAdminUsername: row.operator_admin_username,
  occurredAt: toOccurredAt(row),
  recordedAt: toRecordedAt(row),
  source: toRechargeRecordSource(row.source),
  createdAt: row.created_at
});

const toAdminUserProfileChangeRecordDTO = (
  row: UserProfileChangeLogRow
): AdminUserProfileChangeRecordDTO => ({
  id: row.id,
  changeBatchId: row.change_batch_id,
  userId: row.user_id,
  username: row.username,
  field: toUserProfileChangeField(row.field_name),
  beforeValue: row.before_value,
  afterValue: row.after_value,
  changeNote: row.change_note,
  operatorAdminId: row.operator_admin_id,
  operatorAdminUsername: row.operator_admin_username,
  createdAt: row.created_at
});

const toUserStatusHistoryRecordDTO = (
  row: UserStatusHistoryRow
): UserStatusHistoryRecordDTO => ({
  id: row.id,
  changeDays: row.change_days,
  reason: toRechargeReason(row.reason),
  expireBefore: row.expire_before,
  expireAfter: row.expire_after,
  createdAt: row.occurred_at && row.occurred_at > 0 ? row.occurred_at : row.created_at
});

const toUtc8DayRange = (
  timestamp: number
): {
  dayStartAt: number;
  dayEndAt: number;
} => {
  const shifted = timestamp + UTC8_OFFSET_SECONDS;
  const dayStartAt = Math.floor(shifted / SECONDS_PER_DAY) * SECONDS_PER_DAY - UTC8_OFFSET_SECONDS;
  return {
    dayStartAt,
    dayEndAt: dayStartAt + SECONDS_PER_DAY
  };
};

const requireRechargeTimelineColumns = async (
  c: AppContext
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const hasColumns = await hasRechargeTimelineColumns(c.env.DB);
  if (!hasColumns) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: recharge record columns missing")
    };
  }

  return { ok: true };
};

const rebuildUserRechargeChain = async (
  db: D1Database,
  userId: string,
  updatedAt: number
): Promise<number> => {
  const rows = await db.prepare(
    `SELECT
      id,
      change_days,
      COALESCE(occurred_at, created_at) AS occurred_at,
      expire_before,
      expire_after
    FROM recharge_records
    WHERE user_id = ?
    ORDER BY COALESCE(occurred_at, created_at) ASC, id ASC`
  )
    .bind(userId)
    .all<RechargeRebuildRow>();

  const statements: D1PreparedStatement[] = [];
  const firstRow = rows.results?.[0];
  let runningExpireAt = firstRow ? Math.max(firstRow.expire_before, 0) : 0;

  for (const row of rows.results || []) {
    const expireBefore = runningExpireAt;
    const expireAfter = Math.max(expireBefore, row.occurred_at) + row.change_days * SECONDS_PER_DAY;
    runningExpireAt = expireAfter;

    if (row.expire_before !== expireBefore || row.expire_after !== expireAfter) {
      statements.push(
        db.prepare("UPDATE recharge_records SET expire_before = ?, expire_after = ? WHERE id = ?")
          .bind(expireBefore, expireAfter, row.id)
      );
    }
  }

  statements.push(
    db.prepare("UPDATE users SET expire_at = ?, updated_at = ? WHERE id = ?")
      .bind(runningExpireAt, updatedAt, userId)
  );

  await db.batch(statements);
  return runningExpireAt;
};

const createAndRebuildRechargeRecord = async (
  c: AppContext,
  params: {
    userId: string;
    days: number;
    reason: RechargeReason;
    paymentAmountCents: number;
    internalNote: string | null;
    occurredAt: number;
    source: RechargeRecordSource;
  }
): Promise<AdminRechargeUserResponseDTO | null> => {
  const session = c.get("adminSession");
  const now = getCurrentTimestamp();

  const user = await c.env.DB.prepare(
    "SELECT id, username, expire_at, updated_at FROM users WHERE id = ? LIMIT 1"
  )
    .bind(params.userId)
    .first<RechargeTargetUserRow>();
  if (!user) {
    return null;
  }

  const recordId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO recharge_records (
      id,
      user_id,
      change_days,
      reason,
      payment_amount_cents,
      internal_note,
      expire_before,
      expire_after,
      operator_admin_id,
      created_at,
      occurred_at,
      recorded_at,
      source
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`
  )
    .bind(
      recordId,
      params.userId,
      params.days,
      params.reason,
      params.paymentAmountCents,
      params.internalNote,
      session.adminId,
      now,
      params.occurredAt,
      now,
      params.source
    )
    .run();

  const finalExpireAt = await rebuildUserRechargeChain(c.env.DB, params.userId, now);
  const insertedRow = await c.env.DB.prepare(
    `SELECT
      r.id,
      r.user_id,
      u.username AS username,
      r.change_days,
      r.reason,
      r.payment_amount_cents,
      r.internal_note,
      r.expire_before,
      r.expire_after,
      r.operator_admin_id,
      a.username AS operator_admin_username,
      r.occurred_at,
      r.recorded_at,
      r.source,
      r.created_at
    FROM recharge_records AS r
    INNER JOIN users AS u ON u.id = r.user_id
    INNER JOIN admin_users AS a ON a.id = r.operator_admin_id
    WHERE r.id = ?
    LIMIT 1`
  )
    .bind(recordId)
    .first<RechargeRecordRow>();
  if (!insertedRow) {
    throw new Error("inserted recharge record not found");
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      expireAt: finalExpireAt,
      updatedAt: now
    },
    record: toAdminRechargeRecordDTO(insertedRow)
  };
};

const buildApiResponse = <T>(
  c: AppContext,
  status: HttpStatus,
  code: number,
  message: string,
  data: T
) => {
  const payload: ApiResponse<T> = {
    code,
    message,
    data,
    requestId: c.get("requestId")
  };

  return c.json(payload, status);
};

const ok = <T>(
  c: AppContext,
  data: T,
  message = "ok"
) => buildApiResponse(c, 200, 0, message, data);

const fail = (
  c: AppContext,
  status: Exclude<HttpStatus, 200>,
  message: string
) => buildApiResponse(c, status, status, message, null);

app.use("*", async (c, next) => {
  c.set("requestId", createRequestId(c.req.raw));
  await next();
});

app.use("/api/admin/*", async (c, next) => {
  if (c.req.path === "/api/admin/login") {
    await next();
    return;
  }

  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) {
    return fail(c, 401, "unauthorized");
  }

  const jwtSecret = getJwtSecret(c.env);
  if (!jwtSecret) {
    return fail(c, 500, "JWT secret is not configured");
  }

  try {
    const payload = await verify(token, jwtSecret, "HS256");
    const adminId = typeof payload.sub === "string" ? payload.sub : "";
    const username = typeof payload.username === "string" ? payload.username : "";
    const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;

    if (!adminId || !username || expiresAt <= getCurrentTimestamp()) {
      throw new Error("session expired");
    }

    c.set("adminSession", { adminId, username, expiresAt });
    await next();
  } catch {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/" });
    return fail(c, 401, "unauthorized");
  }
});

app.get("/api/health", (c) => {
  return ok<HealthDTO>(
    c,
    {
      status: "ok",
      timestamp: getCurrentTimestamp(),
      environment: c.env.APP_ENV ?? "unknown"
    },
    "ok"
  );
});

app.get("/api/status/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) {
    return fail(c, 400, "token is required");
  }

  const tokenHash = await sha256Hex(token);
  const user = await c.env.DB.prepare(
    "SELECT id, username, expire_at FROM users WHERE access_token_hash = ? LIMIT 1"
  )
    .bind(tokenHash)
    .first<UserStatusRow>();

  if (!user) {
    return fail(c, 404, "user not found");
  }

  const totalChangeDaysRow = await c.env.DB.prepare(
    `SELECT
      COALESCE(SUM(change_days), 0) AS total_change_days
     FROM recharge_records
     WHERE user_id = ?`
  )
    .bind(user.id)
    .first<UserTotalChangeDaysRow>();

  const hasRechargeTimeline = await hasRechargeTimelineColumns(c.env.DB);
  const historyRows = hasRechargeTimeline
    ? await c.env.DB.prepare(
      `SELECT
        id,
        change_days,
        reason,
        expire_before,
        expire_after,
        occurred_at,
        created_at
       FROM recharge_records
       WHERE user_id = ?
       ORDER BY COALESCE(occurred_at, created_at) DESC, id DESC
       LIMIT ?`
    )
      .bind(user.id, DEFAULT_STATUS_HISTORY_LIMIT)
      .all<UserStatusHistoryRow>()
    : await c.env.DB.prepare(
      `SELECT
        id,
        change_days,
        reason,
        expire_before,
        expire_after,
        NULL AS occurred_at,
        created_at
       FROM recharge_records
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
      .bind(user.id, DEFAULT_STATUS_HISTORY_LIMIT)
      .all<UserStatusHistoryRow>();

  const now = getCurrentTimestamp();
  const remainingDays =
    user.expire_at > now
      ? Math.ceil((user.expire_at - now) / SECONDS_PER_DAY)
      : 0;
  const totalChangeDays = Number(totalChangeDaysRow?.total_change_days || 0);
  const usedDays = Math.max(totalChangeDays - remainingDays, 0);
  const payload: UserStatusResponseDTO = {
    user: {
      id: user.id,
      username: user.username,
      expireAt: user.expire_at,
      status:
        user.expire_at > now
          ? MembershipStatus.ACTIVE
          : MembershipStatus.EXPIRED,
      remainingDays,
      usedDays
    },
    history: (historyRows.results || []).map((row) =>
      toUserStatusHistoryRecordDTO(row)
    ),
    now
  };

  return ok(c, payload);
});

app.post("/api/admin/login", async (c) => {
  const jwtSecret = getJwtSecret(c.env);
  if (!jwtSecret) {
    return fail(c, 500, "JWT secret is not configured");
  }

  const clientIp = getClientIp(c.req.raw);
  const now = getCurrentTimestamp();
  const limitStatus = checkLoginLimit(clientIp, now);
  if (limitStatus.blocked) {
    c.header("Retry-After", String(limitStatus.retryAfterSeconds));
    return fail(c, 429, "too many failed login attempts, please retry later");
  }

  const body = await c.req.json<Partial<AdminLoginRequestDTO>>().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return fail(c, 400, "username and password are required");
  }

  const admin = await c.env.DB.prepare(
    "SELECT id, username, password_hash FROM admin_users WHERE username = ? LIMIT 1"
  )
    .bind(username)
    .first<AdminUserRow>();

  if (!admin || !(await verifyPasswordHash(password, admin.password_hash))) {
    const failedStatus = recordFailedLogin(clientIp, now);
    if (failedStatus.blocked) {
      c.header("Retry-After", String(failedStatus.retryAfterSeconds));
      return fail(c, 429, "too many failed login attempts, please retry later");
    }
    return fail(c, 401, "invalid username or password");
  }

  clearLoginLimit(clientIp);

  const sessionTtlSeconds = parseSessionTtlSeconds(c.env.ADMIN_SESSION_TTL_SECONDS);
  const expiresAt = now + sessionTtlSeconds;
  const token = await sign(
    {
      sub: admin.id,
      username: admin.username,
      iat: now,
      exp: expiresAt
    },
    jwtSecret,
    "HS256"
  );

  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(c.req.raw, c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: sessionTtlSeconds
  });

  await c.env.DB.prepare("UPDATE admin_users SET last_login_at = unixepoch() WHERE id = ?")
    .bind(admin.id)
    .run();

  return ok<AdminLoginResponseDTO>(c, {
    adminId: admin.id,
    username: admin.username,
    expiresAt
  });
});

app.get("/api/admin/session", (c) => {
  const session = c.get("adminSession");
  const payload: AdminSessionDTO = {
    adminId: session.adminId,
    username: session.username,
    expiresAt: session.expiresAt
  };

  return ok(c, payload);
});

app.post("/api/admin/users", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const body = await c.req.json<Partial<AdminCreateUserRequestDTO>>().catch(() => null);
  const username = body?.username?.trim();
  if (!username) {
    return fail(c, 400, "username is required");
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return fail(c, 400, `username must be <= ${MAX_USERNAME_LENGTH} chars`);
  }
  const systemEmail = normalizeOptionalText(body?.systemEmail)?.toLowerCase();
  const familyGroupName = normalizeOptionalText(body?.familyGroupName);
  const userEmail = normalizeOptionalText(body?.userEmail)?.toLowerCase();
  if (familyGroupName && familyGroupName.length > MAX_FAMILY_GROUP_NAME_LENGTH) {
    return fail(c, 400, `familyGroupName must be <= ${MAX_FAMILY_GROUP_NAME_LENGTH} chars`);
  }
  if (systemEmail && systemEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `systemEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (userEmail && userEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `userEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (systemEmail && !EMAIL_PATTERN.test(systemEmail)) {
    return fail(c, 400, "systemEmail must be a valid email");
  }
  if (userEmail && !EMAIL_PATTERN.test(userEmail)) {
    return fail(c, 400, "userEmail must be a valid email");
  }

  const userId = crypto.randomUUID();
  const tokenVersion = DEFAULT_USER_TOKEN_VERSION;
  const statusToken = await buildUserStatusToken(userId, tokenVersion, tokenSecret);
  const tokenHash = await sha256Hex(statusToken);
  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);

  if (!hasUsersProfileColumns && (systemEmail || familyGroupName || userEmail)) {
    return fail(c, 500, "database migration required: users profile columns missing");
  }

  if (hasTokenVersionColumn && hasUsersProfileColumns) {
    await c.env.DB.prepare(
      `INSERT INTO users (
        id,
        username,
        system_email,
        family_group_name,
        user_email,
        access_token_hash,
        token_version,
        expire_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    )
      .bind(userId, username, systemEmail ?? null, familyGroupName ?? null, userEmail ?? null, tokenHash, tokenVersion)
      .run();
  } else if (hasTokenVersionColumn) {
    await c.env.DB.prepare(
      "INSERT INTO users (id, username, access_token_hash, token_version, expire_at) VALUES (?, ?, ?, ?, 0)"
    )
      .bind(userId, username, tokenHash, tokenVersion)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO users (id, username, access_token_hash, expire_at) VALUES (?, ?, ?, 0)"
    )
      .bind(userId, username, tokenHash)
      .run();
  }

  const now = getCurrentTimestamp();
  const payload: AdminCreateUserResponseDTO = {
    user: {
      id: userId,
      username,
      systemEmail: hasUsersProfileColumns ? systemEmail ?? null : null,
      familyGroupName: hasUsersProfileColumns ? familyGroupName ?? null : null,
      userEmail: hasUsersProfileColumns ? userEmail ?? null : null,
      expireAt: 0,
      createdAt: now,
      updatedAt: now,
      tokenVersion,
      statusToken
    }
  };

  return ok(c, payload);
});

app.get("/api/admin/users", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const query = c.req.query("query")?.trim() || "";
  const escapedQuery = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  const tokenVersionSelect = hasTokenVersionColumn
    ? "token_version"
    : `${DEFAULT_USER_TOKEN_VERSION} AS token_version`;
  const profileSelect = hasUsersProfileColumns
    ? "system_email, family_group_name, user_email"
    : "NULL AS system_email, NULL AS family_group_name, NULL AS user_email";

  const rows = query
    ? await c.env.DB.prepare(
      `SELECT id, username, ${profileSelect}, expire_at, created_at, updated_at, ${tokenVersionSelect}
       FROM users
       WHERE username LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(`%${escapedQuery}%`, `%${escapedQuery}%`, USER_LIST_LIMIT)
      .all<UserRow>()
    : await c.env.DB.prepare(
      `SELECT id, username, ${profileSelect}, expire_at, created_at, updated_at, ${tokenVersionSelect}
       FROM users
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(USER_LIST_LIMIT)
      .all<UserRow>();

  const users = await Promise.all((rows.results || []).map((row) => toAdminUserDTO(row, tokenSecret)));
  const payload: AdminListUsersResponseDTO = {
    items: users,
    query
  };

  return ok(c, payload);
});

app.patch("/api/admin/users/:id", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  if (!hasUsersProfileColumns) {
    return fail(c, 500, "database migration required: users profile columns missing");
  }

  const body = await c.req.json<Partial<AdminUpdateUserRequestDTO>>().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!username) {
    return fail(c, 400, "username is required");
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return fail(c, 400, `username must be <= ${MAX_USERNAME_LENGTH} chars`);
  }

  const systemEmail = normalizeOptionalText(body?.systemEmail)?.toLowerCase() ?? null;
  const familyGroupName = normalizeOptionalText(body?.familyGroupName);
  const userEmail = normalizeOptionalText(body?.userEmail)?.toLowerCase() ?? null;
  if (familyGroupName && familyGroupName.length > MAX_FAMILY_GROUP_NAME_LENGTH) {
    return fail(c, 400, `familyGroupName must be <= ${MAX_FAMILY_GROUP_NAME_LENGTH} chars`);
  }
  if (systemEmail && systemEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `systemEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (userEmail && userEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `userEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (systemEmail && !EMAIL_PATTERN.test(systemEmail)) {
    return fail(c, 400, "systemEmail must be a valid email");
  }
  if (userEmail && !EMAIL_PATTERN.test(userEmail)) {
    return fail(c, 400, "userEmail must be a valid email");
  }

  const changeNotesRaw = (
    body?.changeNotes && typeof body.changeNotes === "object"
      ? body.changeNotes
      : {}
  ) as Partial<Record<UserProfileChangeField, unknown>>;
  const changeNotes: Partial<Record<UserProfileChangeField, string | null>> = {
    [UserProfileChangeField.SYSTEM_EMAIL]: normalizeProfileChangeNote(
      changeNotesRaw[UserProfileChangeField.SYSTEM_EMAIL]
    ),
    [UserProfileChangeField.FAMILY_GROUP_NAME]: normalizeProfileChangeNote(
      changeNotesRaw[UserProfileChangeField.FAMILY_GROUP_NAME]
    ),
    [UserProfileChangeField.USER_EMAIL]: normalizeProfileChangeNote(
      changeNotesRaw[UserProfileChangeField.USER_EMAIL]
    )
  };

  for (const field of Object.values(UserProfileChangeField)) {
    const note = changeNotes[field];
    if (note && note.length > MAX_PROFILE_CHANGE_NOTE_LENGTH) {
      return fail(c, 400, `change note for ${field} must be <= ${MAX_PROFILE_CHANGE_NOTE_LENGTH} chars`);
    }
  }

  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  const tokenVersionSelect = hasTokenVersionColumn
    ? "token_version"
    : `${DEFAULT_USER_TOKEN_VERSION} AS token_version`;
  const user = await c.env.DB.prepare(
    `SELECT
      id,
      username,
      system_email,
      family_group_name,
      user_email,
      expire_at,
      created_at,
      updated_at,
      ${tokenVersionSelect}
    FROM users
    WHERE id = ?
    LIMIT 1`
  )
    .bind(userId)
    .first<UserRow>();
  if (!user) {
    return fail(c, 404, "user not found");
  }

  const profileChanges: Array<{
    field: UserProfileChangeField;
    beforeValue: string | null;
    afterValue: string | null;
    changeNote: string | null;
  }> = [];
  if ((user.system_email ?? null) !== systemEmail) {
    profileChanges.push({
      field: UserProfileChangeField.SYSTEM_EMAIL,
      beforeValue: user.system_email ?? null,
      afterValue: systemEmail,
      changeNote: changeNotes[UserProfileChangeField.SYSTEM_EMAIL] ?? null
    });
  }
  if ((user.family_group_name ?? null) !== (familyGroupName ?? null)) {
    profileChanges.push({
      field: UserProfileChangeField.FAMILY_GROUP_NAME,
      beforeValue: user.family_group_name ?? null,
      afterValue: familyGroupName ?? null,
      changeNote: changeNotes[UserProfileChangeField.FAMILY_GROUP_NAME] ?? null
    });
  }
  if ((user.user_email ?? null) !== userEmail) {
    profileChanges.push({
      field: UserProfileChangeField.USER_EMAIL,
      beforeValue: user.user_email ?? null,
      afterValue: userEmail,
      changeNote: changeNotes[UserProfileChangeField.USER_EMAIL] ?? null
    });
  }

  for (const change of profileChanges) {
    if (!change.changeNote) {
      return fail(c, 400, `change note is required for ${change.field}`);
    }
  }

  const usernameChanged = user.username !== username;
  const hasAnyChange = usernameChanged || profileChanges.length > 0;
  const now = getCurrentTimestamp();
  const session = c.get("adminSession");

  try {
    if (hasAnyChange) {
      await c.env.DB.prepare(
        `UPDATE users
         SET username = ?, system_email = ?, family_group_name = ?, user_email = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(username, systemEmail, familyGroupName ?? null, userEmail, now, userId)
        .run();
    }

    if (profileChanges.length > 0) {
      const changeBatchId = crypto.randomUUID();
      const statements = profileChanges.map((change) =>
        c.env.DB.prepare(
          `INSERT INTO user_profile_change_logs (
            id,
            change_batch_id,
            user_id,
            field_name,
            before_value,
            after_value,
            change_note,
            operator_admin_id,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            crypto.randomUUID(),
            changeBatchId,
            userId,
            change.field,
            change.beforeValue,
            change.afterValue,
            change.changeNote,
            session.adminId,
            now
          )
      );

      await c.env.DB.batch(statements);
    }
  } catch (error) {
    console.error("update user profile failed", error);
    return fail(c, 500, "failed to update user");
  }

  const nextRow: UserRow = {
    ...user,
    username,
    system_email: systemEmail,
    family_group_name: familyGroupName ?? null,
    user_email: userEmail,
    updated_at: hasAnyChange ? now : user.updated_at
  };
  const payload: AdminUpdateUserResponseDTO = {
    user: await toAdminUserDTO(nextRow, tokenSecret)
  };

  return ok(c, payload);
});

app.post("/api/admin/users/:id/recharge", async (c) => {
  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const migrationCheck = await requireRechargeTimelineColumns(c);
  if (!migrationCheck.ok) {
    return migrationCheck.response;
  }

  const body = await c.req.json<Partial<AdminRechargeUserRequestDTO>>().catch(() => null);
  const days = Number(body?.days);
  const reasonRaw = typeof body?.reason === "string" ? body.reason : "";
  const paymentAmount = normalizePaymentAmount(body?.paymentAmount);
  const internalNote = normalizeInternalNote(body?.internalNote);

  if (!Number.isInteger(days) || days <= 0 || days > MAX_RECHARGE_DAYS) {
    return fail(c, 400, `days must be an integer between 1 and ${MAX_RECHARGE_DAYS}`);
  }
  if (!isRechargeReason(reasonRaw)) {
    return fail(c, 400, "invalid recharge reason");
  }
  if (paymentAmount === null || paymentAmount < 0 || paymentAmount > MAX_PAYMENT_AMOUNT) {
    return fail(c, 400, `paymentAmount must be between 0 and ${MAX_PAYMENT_AMOUNT}`);
  }
  if (internalNote && internalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
    return fail(c, 400, `internalNote must be <= ${MAX_INTERNAL_NOTE_LENGTH} chars`);
  }

  try {
    const now = getCurrentTimestamp();
    const payload = await createAndRebuildRechargeRecord(c, {
      userId,
      days,
      reason: reasonRaw,
      paymentAmountCents: toPaymentAmountCents(paymentAmount),
      internalNote,
      occurredAt: now,
      source: RechargeRecordSource.NORMAL
    });
    if (!payload) {
      return fail(c, 404, "user not found");
    }

    return ok(c, payload);
  } catch (error) {
    console.error("recharge failed", error);
    return fail(c, 500, "failed to recharge user");
  }
});

app.post("/api/admin/users/:id/recharge/backfill", async (c) => {
  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const migrationCheck = await requireRechargeTimelineColumns(c);
  if (!migrationCheck.ok) {
    return migrationCheck.response;
  }

  const body = await c.req.json<Partial<AdminBackfillRechargeRequestDTO>>().catch(() => null);
  const days = Number(body?.days);
  const reasonRaw = typeof body?.reason === "string" ? body.reason : "";
  const paymentAmount = normalizePaymentAmount(body?.paymentAmount);
  const occurredAt = Number(body?.occurredAt);
  const internalNote = normalizeInternalNote(body?.internalNote);
  const now = getCurrentTimestamp();

  if (!Number.isInteger(days) || days <= 0 || days > MAX_RECHARGE_DAYS) {
    return fail(c, 400, `days must be an integer between 1 and ${MAX_RECHARGE_DAYS}`);
  }
  if (!isRechargeReason(reasonRaw)) {
    return fail(c, 400, "invalid recharge reason");
  }
  if (paymentAmount === null || paymentAmount < 0 || paymentAmount > MAX_PAYMENT_AMOUNT) {
    return fail(c, 400, `paymentAmount must be between 0 and ${MAX_PAYMENT_AMOUNT}`);
  }
  if (!Number.isInteger(occurredAt) || occurredAt <= 0) {
    return fail(c, 400, "occurredAt must be a positive unix timestamp");
  }
  if (occurredAt > now) {
    return fail(c, 400, "occurredAt cannot be in the future");
  }
  if (internalNote && internalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
    return fail(c, 400, `internalNote must be <= ${MAX_INTERNAL_NOTE_LENGTH} chars`);
  }

  try {
    const payload = await createAndRebuildRechargeRecord(c, {
      userId,
      days,
      reason: reasonRaw,
      paymentAmountCents: toPaymentAmountCents(paymentAmount),
      internalNote,
      occurredAt,
      source: RechargeRecordSource.BACKFILL
    });
    if (!payload) {
      return fail(c, 404, "user not found");
    }

    return ok(c, payload);
  } catch (error) {
    console.error("recharge backfill failed", error);
    return fail(c, 500, "failed to backfill recharge record");
  }
});

app.post("/api/admin/users/:id/reset-token", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  if (!hasTokenVersionColumn) {
    return fail(c, 500, "token reset requires users.token_version migration");
  }
  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  const profileSelect = hasUsersProfileColumns
    ? "system_email, family_group_name, user_email,"
    : "NULL AS system_email, NULL AS family_group_name, NULL AS user_email,";

  const now = getCurrentTimestamp();
  const session = c.get("adminSession");

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user = await c.env.DB.prepare(
        `SELECT
          id,
          username,
          ${profileSelect}
          expire_at,
          created_at,
          token_version,
          access_token_hash
        FROM users
        WHERE id = ?
        LIMIT 1`
      )
        .bind(userId)
        .first<ResetTokenTargetUserRow>();

      if (!user) {
        return fail(c, 404, "user not found");
      }

      const oldTokenHash = user.access_token_hash;
      const nextTokenVersion = Math.max(
        user.token_version || DEFAULT_USER_TOKEN_VERSION,
        DEFAULT_USER_TOKEN_VERSION
      ) + 1;
      const nextStatusToken = await buildUserStatusToken(
        user.id,
        nextTokenVersion,
        tokenSecret
      );
      const newTokenHash = await sha256Hex(nextStatusToken);
      const updateResult = await c.env.DB.prepare(
        `UPDATE users
         SET access_token_hash = ?, token_version = ?, updated_at = ?
         WHERE id = ? AND access_token_hash = ? AND token_version = ?`
      )
        .bind(
          newTokenHash,
          nextTokenVersion,
          now,
          user.id,
          oldTokenHash,
          user.token_version
        )
        .run();
      const updateChanges = Number(updateResult.meta?.changes || 0);

      if (updateChanges === 0) {
        continue;
      }

      const resetLogId = crypto.randomUUID();
      await c.env.DB.prepare(
        `INSERT INTO token_reset_logs (
          id,
          user_id,
          old_token_hash,
          new_token_hash,
          operator_admin_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          resetLogId,
          user.id,
          oldTokenHash,
          newTokenHash,
          session.adminId,
          now
        )
        .run();

      const payload: AdminResetUserTokenResponseDTO = {
        user: {
          id: user.id,
          username: user.username,
          systemEmail: user.system_email ?? null,
          familyGroupName: user.family_group_name ?? null,
          userEmail: user.user_email ?? null,
          expireAt: user.expire_at,
          createdAt: user.created_at,
          updatedAt: now,
          tokenVersion: nextTokenVersion,
          statusToken: nextStatusToken
        }
      };

      return ok(c, payload);
    }
  } catch (error) {
    console.error("reset token failed", error);
    return fail(c, 500, "failed to reset user token");
  }

  return fail(c, 500, "reset token conflict, please retry");
});

app.get("/api/admin/recharge-records", async (c) => {
  const rawLimit = Number(c.req.query("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RECHARGE_RECORD_LIMIT)
      : DEFAULT_RECHARGE_RECORD_LIMIT;
  const hasRechargeTimeline = await hasRechargeTimelineColumns(c.env.DB);
  const rows = hasRechargeTimeline
    ? await c.env.DB.prepare(
      `SELECT
        r.id,
        r.user_id,
        u.username AS username,
        r.change_days,
        r.reason,
        r.payment_amount_cents,
        r.internal_note,
        r.expire_before,
        r.expire_after,
        r.operator_admin_id,
        a.username AS operator_admin_username,
        r.occurred_at,
        r.recorded_at,
        r.source,
        r.created_at
      FROM recharge_records AS r
      INNER JOIN users AS u ON u.id = r.user_id
      INNER JOIN admin_users AS a ON a.id = r.operator_admin_id
      ORDER BY COALESCE(r.occurred_at, r.created_at) DESC, r.id DESC
      LIMIT ?`
    )
      .bind(limit)
      .all<RechargeRecordRow>()
    : await c.env.DB.prepare(
      `SELECT
        r.id,
        r.user_id,
        u.username AS username,
        r.change_days,
        r.reason,
        0 AS payment_amount_cents,
        r.internal_note,
        r.expire_before,
        r.expire_after,
        r.operator_admin_id,
        a.username AS operator_admin_username,
        NULL AS occurred_at,
        NULL AS recorded_at,
        'normal' AS source,
        r.created_at
      FROM recharge_records AS r
      INNER JOIN users AS u ON u.id = r.user_id
      INNER JOIN admin_users AS a ON a.id = r.operator_admin_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ?`
    )
      .bind(limit)
      .all<RechargeRecordRow>();

  const payload: AdminListRechargeRecordsResponseDTO = {
    items: (rows.results || []).map((row) => toAdminRechargeRecordDTO(row)),
    limit
  };

  return ok(c, payload);
});

app.get("/api/admin/user-profile-change-logs", async (c) => {
  const rawLimit = Number(c.req.query("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_PROFILE_CHANGE_LOG_LIMIT)
      : DEFAULT_PROFILE_CHANGE_LOG_LIMIT;

  try {
    const rows = await c.env.DB.prepare(
      `SELECT
        l.id,
        l.change_batch_id,
        l.user_id,
        u.username AS username,
        l.field_name,
        l.before_value,
        l.after_value,
        l.change_note,
        l.operator_admin_id,
        a.username AS operator_admin_username,
        l.created_at
      FROM user_profile_change_logs AS l
      INNER JOIN users AS u ON u.id = l.user_id
      INNER JOIN admin_users AS a ON a.id = l.operator_admin_id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ?`
    )
      .bind(limit)
      .all<UserProfileChangeLogRow>();
    const payload: AdminListUserProfileChangeLogsResponseDTO = {
      items: (rows.results || []).map((row) => toAdminUserProfileChangeRecordDTO(row)),
      limit
    };

    return ok(c, payload);
  } catch (error) {
    console.error("list user profile change logs failed", error);
    return fail(c, 500, "database migration required: user profile change logs table missing");
  }
});

app.get("/api/admin/dashboard/today", async (c) => {
  const range = toUtc8DayRange(getCurrentTimestamp());
  const hasRechargeTimeline = await hasRechargeTimelineColumns(c.env.DB);
  const row = hasRechargeTimeline
    ? await c.env.DB.prepare(
      `SELECT
        COUNT(*) AS recharge_count,
        COALESCE(SUM(change_days), 0) AS total_change_days
      FROM recharge_records
      WHERE COALESCE(recorded_at, created_at) >= ? AND COALESCE(recorded_at, created_at) < ?`
    )
      .bind(range.dayStartAt, range.dayEndAt)
      .first<DashboardTodayRow>()
    : await c.env.DB.prepare(
      `SELECT
        COUNT(*) AS recharge_count,
        COALESCE(SUM(change_days), 0) AS total_change_days
      FROM recharge_records
      WHERE created_at >= ? AND created_at < ?`
    )
      .bind(range.dayStartAt, range.dayEndAt)
      .first<DashboardTodayRow>();

  const payload: AdminDashboardTodayDTO = {
    dayStartAt: range.dayStartAt,
    dayEndAt: range.dayEndAt,
    rechargeCount: Number(row?.recharge_count || 0),
    totalChangeDays: Number(row?.total_change_days || 0)
  };

  return ok(c, payload);
});

app.post("/api/admin/logout", (c) => {
  deleteCookie(c, ADMIN_SESSION_COOKIE, {
    path: "/"
  });

  return ok(c, { success: true });
});

app.get("/", (c) => {
  return c.text("VIP membership backend is running.");
});

export default app;

import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import {
  RechargeReason,
  type AdminCreateUserRequestDTO,
  type AdminCreateUserResponseDTO,
  type AdminDashboardTodayDTO,
  type AdminListRechargeRecordsResponseDTO,
  type AdminListUsersResponseDTO,
  type AdminLoginRequestDTO,
  type AdminLoginResponseDTO,
  type AdminRechargeRecordDTO,
  type AdminRechargeUserRequestDTO,
  type AdminRechargeUserResponseDTO,
  type AdminSessionDTO,
  type AdminUserDTO,
  type ApiResponse,
  type HealthDTO
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
const USER_LIST_LIMIT = 100;
const MAX_REMARK_NAME_LENGTH = 80;
const MAX_INTERNAL_NOTE_LENGTH = 200;
const MAX_RECHARGE_DAYS = 3650;
const SECONDS_PER_DAY = 24 * 60 * 60;
const UTC8_OFFSET_SECONDS = 8 * 60 * 60;
type HttpStatus = 200 | 400 | 401 | 404 | 429 | 500;

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
}

interface UserRow {
  id: string;
  remark_name: string;
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
  remark_name: string;
  expire_at: number;
}

interface RechargeRecordRow {
  id: string;
  user_id: string;
  user_remark_name: string;
  change_days: number;
  reason: string;
  internal_note: string | null;
  expire_before: number;
  expire_after: number;
  operator_admin_id: string;
  operator_admin_username: string;
  created_at: number;
}

interface DashboardTodayRow {
  recharge_count: number | string | null;
  total_change_days: number | string | null;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
let cachedHasUsersTokenVersionColumn: boolean | null = null;

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
    remarkName: row.remark_name,
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

const toAdminRechargeRecordDTO = (row: RechargeRecordRow): AdminRechargeRecordDTO => ({
  id: row.id,
  userId: row.user_id,
  userRemarkName: row.user_remark_name,
  changeDays: row.change_days,
  reason: toRechargeReason(row.reason),
  internalNote: row.internal_note,
  expireBefore: row.expire_before,
  expireAfter: row.expire_after,
  operatorAdminId: row.operator_admin_id,
  operatorAdminUsername: row.operator_admin_username,
  createdAt: row.created_at
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
  const remarkName = body?.remarkName?.trim();
  if (!remarkName) {
    return fail(c, 400, "remarkName is required");
  }
  if (remarkName.length > MAX_REMARK_NAME_LENGTH) {
    return fail(c, 400, `remarkName must be <= ${MAX_REMARK_NAME_LENGTH} chars`);
  }

  const userId = crypto.randomUUID();
  const tokenVersion = DEFAULT_USER_TOKEN_VERSION;
  const statusToken = await buildUserStatusToken(userId, tokenVersion, tokenSecret);
  const tokenHash = await sha256Hex(statusToken);
  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);

  if (hasTokenVersionColumn) {
    await c.env.DB.prepare(
      "INSERT INTO users (id, remark_name, access_token_hash, token_version, expire_at) VALUES (?, ?, ?, ?, 0)"
    )
      .bind(userId, remarkName, tokenHash, tokenVersion)
      .run();
  } else {
    await c.env.DB.prepare(
      "INSERT INTO users (id, remark_name, access_token_hash, expire_at) VALUES (?, ?, ?, 0)"
    )
      .bind(userId, remarkName, tokenHash)
      .run();
  }

  const now = getCurrentTimestamp();
  const payload: AdminCreateUserResponseDTO = {
    user: {
      id: userId,
      remarkName,
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
  const tokenVersionSelect = hasTokenVersionColumn
    ? "token_version"
    : `${DEFAULT_USER_TOKEN_VERSION} AS token_version`;

  const rows = query
    ? await c.env.DB.prepare(
      `SELECT id, remark_name, expire_at, created_at, updated_at, ${tokenVersionSelect}
       FROM users
       WHERE remark_name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\'
       ORDER BY created_at DESC
       LIMIT ?`
    )
      .bind(`%${escapedQuery}%`, `%${escapedQuery}%`, USER_LIST_LIMIT)
      .all<UserRow>()
    : await c.env.DB.prepare(
      `SELECT id, remark_name, expire_at, created_at, updated_at, ${tokenVersionSelect}
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

app.post("/api/admin/users/:id/recharge", async (c) => {
  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const body = await c.req.json<Partial<AdminRechargeUserRequestDTO>>().catch(() => null);
  const days = Number(body?.days);
  const reasonRaw = typeof body?.reason === "string" ? body.reason : "";
  const internalNote = normalizeInternalNote(body?.internalNote);

  if (!Number.isInteger(days) || days <= 0 || days > MAX_RECHARGE_DAYS) {
    return fail(c, 400, `days must be an integer between 1 and ${MAX_RECHARGE_DAYS}`);
  }
  if (!isRechargeReason(reasonRaw)) {
    return fail(c, 400, "invalid recharge reason");
  }
  if (internalNote && internalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
    return fail(c, 400, `internalNote must be <= ${MAX_INTERNAL_NOTE_LENGTH} chars`);
  }

  const session = c.get("adminSession");
  const now = getCurrentTimestamp();
  const rechargeSeconds = days * SECONDS_PER_DAY;

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user = await c.env.DB.prepare(
        "SELECT id, remark_name, expire_at FROM users WHERE id = ? LIMIT 1"
      )
        .bind(userId)
        .first<RechargeTargetUserRow>();

      if (!user) {
        return fail(c, 404, "user not found");
      }

      const expireBefore = user.expire_at;
      const expireAfter = Math.max(expireBefore, now) + rechargeSeconds;
      const updateResult = await c.env.DB.prepare(
        "UPDATE users SET expire_at = ?, updated_at = ? WHERE id = ? AND expire_at = ?"
      )
        .bind(expireAfter, now, userId, expireBefore)
        .run();
      const updateChanges = Number(updateResult.meta?.changes || 0);

      if (updateChanges === 0) {
        continue;
      }

      const recordId = crypto.randomUUID();
      await c.env.DB.prepare(
        `INSERT INTO recharge_records (
          id,
          user_id,
          change_days,
          reason,
          internal_note,
          expire_before,
          expire_after,
          operator_admin_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          recordId,
          userId,
          days,
          reasonRaw,
          internalNote,
          expireBefore,
          expireAfter,
          session.adminId,
          now
        )
        .run();

      const payload: AdminRechargeUserResponseDTO = {
        user: {
          id: user.id,
          remarkName: user.remark_name,
          expireAt: expireAfter,
          updatedAt: now
        },
        record: {
          id: recordId,
          userId: user.id,
          userRemarkName: user.remark_name,
          changeDays: days,
          reason: reasonRaw,
          internalNote,
          expireBefore,
          expireAfter,
          operatorAdminId: session.adminId,
          operatorAdminUsername: session.username,
          createdAt: now
        }
      };

      return ok(c, payload);
    }
  } catch (error) {
    console.error("recharge failed", error);
    return fail(c, 500, "failed to recharge user");
  }

  return fail(c, 500, "recharge conflict, please retry");
});

app.get("/api/admin/recharge-records", async (c) => {
  const rawLimit = Number(c.req.query("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RECHARGE_RECORD_LIMIT)
      : DEFAULT_RECHARGE_RECORD_LIMIT;

  const rows = await c.env.DB.prepare(
    `SELECT
      r.id,
      r.user_id,
      u.remark_name AS user_remark_name,
      r.change_days,
      r.reason,
      r.internal_note,
      r.expire_before,
      r.expire_after,
      r.operator_admin_id,
      a.username AS operator_admin_username,
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

app.get("/api/admin/dashboard/today", async (c) => {
  const range = toUtc8DayRange(getCurrentTimestamp());
  const row = await c.env.DB.prepare(
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

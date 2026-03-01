import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import type {
  AdminLoginRequestDTO,
  AdminLoginResponseDTO,
  AdminSessionDTO,
  ApiResponse,
  HealthDTO
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
type HttpStatus = 200 | 400 | 401 | 429 | 500;

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

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

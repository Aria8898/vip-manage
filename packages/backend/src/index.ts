import { Hono } from "hono";
import type { ApiResponse, HealthDTO } from "@vip/shared";

import { createRequestId } from "./lib/request-id";

type Bindings = {
  DB: D1Database;
  APP_ENV?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/api/health", (c) => {
  const requestId = createRequestId(c.req.raw);
  const payload: ApiResponse<HealthDTO> = {
    code: 0,
    message: "ok",
    data: {
      status: "ok",
      timestamp: Math.floor(Date.now() / 1000),
      environment: c.env.APP_ENV ?? "unknown"
    },
    requestId
  };

  return c.json(payload);
});

app.get("/", (c) => {
  return c.text("VIP membership backend is running.");
});

export default app;

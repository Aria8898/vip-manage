interface RateLimitState {
  windowStartedAt: number;
  requestCount: number;
}

export interface FixedWindowRateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
  staleSeconds?: number;
}

export interface RateLimitCheckResult {
  blocked: boolean;
  retryAfterSeconds: number;
  remaining: number;
  limit: number;
  windowSeconds: number;
}

const DEFAULT_STALE_SECONDS = 24 * 60 * 60;

export const createFixedWindowRateLimiter = (
  options: FixedWindowRateLimitOptions,
) => {
  const limit = Math.max(1, Math.floor(options.maxRequests));
  const windowSeconds = Math.max(1, Math.floor(options.windowSeconds));
  const staleSeconds = Math.max(
    windowSeconds,
    Math.floor(options.staleSeconds ?? DEFAULT_STALE_SECONDS),
  );
  const store = new Map<string, RateLimitState>();
  let cleanupTick = 0;

  const maybeCleanup = (now: number) => {
    cleanupTick += 1;
    if (cleanupTick % 128 !== 0) {
      return;
    }

    for (const [key, state] of store.entries()) {
      if (now - state.windowStartedAt > staleSeconds) {
        store.delete(key);
      }
    }
  };

  const check = (rawKey: string, now: number): RateLimitCheckResult => {
    maybeCleanup(now);
    const key = rawKey || "unknown";
    const existing = store.get(key);

    if (!existing || now - existing.windowStartedAt >= windowSeconds) {
      store.set(key, {
        windowStartedAt: now,
        requestCount: 1,
      });
      return {
        blocked: false,
        retryAfterSeconds: 0,
        remaining: Math.max(limit - 1, 0),
        limit,
        windowSeconds,
      };
    }

    if (existing.requestCount >= limit) {
      return {
        blocked: true,
        retryAfterSeconds: Math.max(
          1,
          windowSeconds - (now - existing.windowStartedAt),
        ),
        remaining: 0,
        limit,
        windowSeconds,
      };
    }

    existing.requestCount += 1;
    return {
      blocked: false,
      retryAfterSeconds: 0,
      remaining: Math.max(limit - existing.requestCount, 0),
      limit,
      windowSeconds,
    };
  };

  return {
    check,
  };
};

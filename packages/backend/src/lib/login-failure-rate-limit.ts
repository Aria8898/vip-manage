const WINDOW_SECONDS = 10 * 60;
const BLOCK_SECONDS = 10 * 60;
const MAX_FAILURES = 5;
const STALE_SECONDS = 24 * 60 * 60;

interface FailureState {
  windowStartedAt: number;
  failedCount: number;
  blockedUntil: number;
}

const store = new Map<string, FailureState>();
let cleanupTick = 0;

const maybeCleanup = (now: number) => {
  cleanupTick += 1;
  if (cleanupTick % 128 !== 0) {
    return;
  }

  for (const [ip, state] of store.entries()) {
    const inactiveFor = now - Math.max(state.windowStartedAt, state.blockedUntil);
    if (inactiveFor > STALE_SECONDS) {
      store.delete(ip);
    }
  }
};

const normalizeState = (ip: string, now: number): FailureState | null => {
  const state = store.get(ip);
  if (!state) {
    return null;
  }

  if (state.blockedUntil <= now && now - state.windowStartedAt > WINDOW_SECONDS) {
    state.windowStartedAt = now;
    state.failedCount = 0;
    state.blockedUntil = 0;
  }

  return state;
};

export interface LoginLimitStatus {
  blocked: boolean;
  retryAfterSeconds: number;
}

export const checkLoginLimit = (ip: string, now: number): LoginLimitStatus => {
  maybeCleanup(now);
  const state = normalizeState(ip, now);
  if (!state || state.blockedUntil <= now) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return {
    blocked: true,
    retryAfterSeconds: Math.max(1, state.blockedUntil - now)
  };
};

export const recordFailedLogin = (ip: string, now: number): LoginLimitStatus => {
  maybeCleanup(now);

  let state = normalizeState(ip, now);
  if (!state) {
    state = {
      windowStartedAt: now,
      failedCount: 0,
      blockedUntil: 0
    };
    store.set(ip, state);
  }

  if (state.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, state.blockedUntil - now)
    };
  }

  if (now - state.windowStartedAt > WINDOW_SECONDS) {
    state.windowStartedAt = now;
    state.failedCount = 0;
  }

  state.failedCount += 1;

  if (state.failedCount >= MAX_FAILURES) {
    state.failedCount = 0;
    state.windowStartedAt = now;
    state.blockedUntil = now + BLOCK_SECONDS;
    return {
      blocked: true,
      retryAfterSeconds: BLOCK_SECONDS
    };
  }

  return { blocked: false, retryAfterSeconds: 0 };
};

export const clearLoginLimit = (ip: string) => {
  store.delete(ip);
};

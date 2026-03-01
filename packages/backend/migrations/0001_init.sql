PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  remark_name TEXT NOT NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  expire_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS admin_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS recharge_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  change_days INTEGER NOT NULL,
  reason TEXT NOT NULL,
  internal_note TEXT,
  expire_before INTEGER NOT NULL,
  expire_after INTEGER NOT NULL,
  operator_admin_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (operator_admin_id) REFERENCES admin_users(id)
);

CREATE TABLE IF NOT EXISTS token_reset_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  old_token_hash TEXT NOT NULL,
  new_token_hash TEXT NOT NULL,
  operator_admin_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (operator_admin_id) REFERENCES admin_users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_access_token_hash
ON users(access_token_hash);

CREATE INDEX IF NOT EXISTS idx_users_remark_name
ON users(remark_name);

CREATE INDEX IF NOT EXISTS idx_recharge_records_user_created_at
ON recharge_records(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recharge_records_created_at
ON recharge_records(created_at);

CREATE TABLE IF NOT EXISTS user_profile_change_logs (
  id TEXT PRIMARY KEY,
  change_batch_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  before_value TEXT,
  after_value TEXT,
  change_note TEXT NOT NULL,
  operator_admin_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (operator_admin_id) REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_profile_change_logs_user_created_at
ON user_profile_change_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_profile_change_logs_created_at
ON user_profile_change_logs(created_at DESC);


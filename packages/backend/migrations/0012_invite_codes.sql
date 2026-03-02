ALTER TABLE users ADD COLUMN system_invite_code TEXT;

UPDATE users
SET system_invite_code = UPPER(SUBSTR(REPLACE(id, '-', ''), 1, 8))
WHERE system_invite_code IS NULL OR system_invite_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_system_invite_code
ON users(system_invite_code)
WHERE system_invite_code IS NOT NULL AND system_invite_code != '';

CREATE TABLE IF NOT EXISTS invite_aliases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  alias_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by_admin_id TEXT,
  updated_by_admin_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id),
  FOREIGN KEY (updated_by_admin_id) REFERENCES admin_users(id),
  CHECK (status IN ('active', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_invite_aliases_user_status
ON invite_aliases(user_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invite_aliases_user_active
ON invite_aliases(user_id)
WHERE status = 'active';

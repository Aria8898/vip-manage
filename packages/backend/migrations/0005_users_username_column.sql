ALTER TABLE users RENAME COLUMN remark_name TO username;

DROP INDEX IF EXISTS idx_users_remark_name;
CREATE INDEX IF NOT EXISTS idx_users_username
ON users(username);

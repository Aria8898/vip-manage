ALTER TABLE recharge_records ADD COLUMN rollback_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recharge_records_rollback_key
ON recharge_records(rollback_key)
WHERE rollback_key IS NOT NULL AND rollback_key != '';

CREATE TABLE IF NOT EXISTS refund_repair_tasks (
  id TEXT PRIMARY KEY,
  recharge_record_id TEXT NOT NULL UNIQUE,
  rollback_record_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT NOT NULL DEFAULT '',
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  resolved_at INTEGER,
  FOREIGN KEY (recharge_record_id) REFERENCES recharge_records(id),
  FOREIGN KEY (rollback_record_id) REFERENCES recharge_records(id),
  CHECK (status IN ('pending', 'resolved')),
  CHECK (retry_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_refund_repair_tasks_status_updated
ON refund_repair_tasks(status, updated_at DESC);

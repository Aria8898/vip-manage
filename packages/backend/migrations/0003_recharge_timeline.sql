ALTER TABLE recharge_records ADD COLUMN occurred_at INTEGER;
ALTER TABLE recharge_records ADD COLUMN recorded_at INTEGER;
ALTER TABLE recharge_records ADD COLUMN source TEXT;

UPDATE recharge_records
SET occurred_at = created_at
WHERE occurred_at IS NULL;

UPDATE recharge_records
SET recorded_at = created_at
WHERE recorded_at IS NULL;

UPDATE recharge_records
SET source = 'normal'
WHERE source IS NULL OR source = '';

CREATE INDEX IF NOT EXISTS idx_recharge_records_user_occurred_at
ON recharge_records(user_id, occurred_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_recharge_records_recorded_at
ON recharge_records(recorded_at);

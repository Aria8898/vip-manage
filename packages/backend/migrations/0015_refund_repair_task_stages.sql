ALTER TABLE refund_repair_tasks ADD COLUMN current_step TEXT NOT NULL DEFAULT 'rollback';
ALTER TABLE refund_repair_tasks ADD COLUMN intended_refund_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE refund_repair_tasks ADD COLUMN intended_refund_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE refund_repair_tasks ADD COLUMN intended_refund_note TEXT;
ALTER TABLE refund_repair_tasks ADD COLUMN rollback_applied_at INTEGER;
ALTER TABLE refund_repair_tasks ADD COLUMN referral_adjusted_at INTEGER;
ALTER TABLE refund_repair_tasks ADD COLUMN bonus_revoked_at INTEGER;
ALTER TABLE refund_repair_tasks ADD COLUMN refund_marked_at INTEGER;

UPDATE refund_repair_tasks
SET current_step = CASE
  WHEN status = 'resolved' THEN 'resolved'
  ELSE 'rollback'
END
WHERE current_step IS NULL OR current_step = '';

CREATE INDEX IF NOT EXISTS idx_refund_repair_tasks_status_step_updated
ON refund_repair_tasks(status, current_step, updated_at DESC);

ALTER TABLE users ADD COLUMN referral_reward_debt_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE referral_reward_ledger ADD COLUMN unlock_start_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referral_reward_ledger ADD COLUMN total_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referral_reward_ledger ADD COLUMN unlocked_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referral_reward_ledger ADD COLUMN unlocked_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referral_reward_ledger ADD COLUMN withdrawn_amount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referral_reward_ledger ADD COLUMN fully_unlocked_at INTEGER;

ALTER TABLE referral_withdrawals ADD COLUMN debt_offset_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referral_withdrawals ADD COLUMN gross_amount_cents INTEGER NOT NULL DEFAULT 0;

UPDATE referral_reward_ledger
SET unlock_start_at = COALESCE(
  (
    SELECT COALESCE(r.occurred_at, r.created_at)
    FROM recharge_records AS r
    WHERE r.id = referral_reward_ledger.recharge_record_id
    LIMIT 1
  ),
  created_at
)
WHERE unlock_start_at <= 0;

UPDATE referral_reward_ledger
SET total_days = COALESCE(
  (
    SELECT CASE WHEN r.change_days > 0 THEN r.change_days ELSE 0 END
    FROM recharge_records AS r
    WHERE r.id = referral_reward_ledger.recharge_record_id
    LIMIT 1
  ),
  0
)
WHERE total_days <= 0;

UPDATE referral_reward_ledger
SET unlocked_days = CASE
  WHEN status IN ('available', 'withdrawn') THEN total_days
  ELSE 0
END;

UPDATE referral_reward_ledger
SET unlocked_amount_cents = CASE
  WHEN status IN ('available', 'withdrawn') THEN reward_amount_cents
  ELSE 0
END;

UPDATE referral_reward_ledger
SET withdrawn_amount_cents = CASE
  WHEN status = 'withdrawn' THEN reward_amount_cents
  ELSE 0
END;

UPDATE referral_reward_ledger
SET fully_unlocked_at = CASE
  WHEN total_days > 0 AND unlocked_days >= total_days THEN COALESCE(available_at, unlock_at, created_at)
  ELSE fully_unlocked_at
END;

UPDATE referral_withdrawals
SET gross_amount_cents = amount_cents
WHERE gross_amount_cents <= 0;

CREATE INDEX IF NOT EXISTS idx_referral_reward_unlock_progress
ON referral_reward_ledger(status, unlock_start_at, total_days, unlocked_days);

CREATE INDEX IF NOT EXISTS idx_referral_reward_inviter_unlock
ON referral_reward_ledger(inviter_user_id, unlock_start_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_users_referral_reward_debt
ON users(referral_reward_debt_cents);

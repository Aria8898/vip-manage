ALTER TABLE recharge_records ADD COLUMN refunded_at INTEGER;
ALTER TABLE recharge_records ADD COLUMN refund_note TEXT;
ALTER TABLE recharge_records ADD COLUMN refunded_by_admin_id TEXT;
ALTER TABLE recharge_records ADD COLUMN refund_amount_cents INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_referrals (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  invitee_user_id TEXT NOT NULL UNIQUE,
  bound_by_admin_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (inviter_user_id) REFERENCES users(id),
  FOREIGN KEY (invitee_user_id) REFERENCES users(id),
  FOREIGN KEY (bound_by_admin_id) REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_referrals_inviter
ON user_referrals(inviter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_withdrawals (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  processed_by_admin_id TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (inviter_user_id) REFERENCES users(id),
  FOREIGN KEY (processed_by_admin_id) REFERENCES admin_users(id),
  CHECK (amount_cents > 0)
);

CREATE INDEX IF NOT EXISTS idx_referral_withdrawals_inviter_created
ON referral_withdrawals(inviter_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_reward_ledger (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL,
  invitee_user_id TEXT NOT NULL,
  recharge_record_id TEXT NOT NULL UNIQUE,
  recharge_reason TEXT NOT NULL,
  recharge_source TEXT NOT NULL,
  payment_amount_cents INTEGER NOT NULL,
  reward_rate_bps INTEGER NOT NULL,
  reward_amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  unlock_at INTEGER NOT NULL,
  available_at INTEGER,
  canceled_at INTEGER,
  canceled_reason TEXT,
  withdrawn_at INTEGER,
  withdrawal_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (inviter_user_id) REFERENCES users(id),
  FOREIGN KEY (invitee_user_id) REFERENCES users(id),
  FOREIGN KEY (recharge_record_id) REFERENCES recharge_records(id),
  FOREIGN KEY (withdrawal_id) REFERENCES referral_withdrawals(id),
  CHECK (payment_amount_cents >= 0),
  CHECK (reward_amount_cents >= 0),
  CHECK (reward_rate_bps >= 0 AND reward_rate_bps <= 10000),
  CHECK (status IN ('pending', 'available', 'canceled', 'withdrawn'))
);

CREATE INDEX IF NOT EXISTS idx_referral_reward_status_unlock
ON referral_reward_ledger(status, unlock_at);

CREATE INDEX IF NOT EXISTS idx_referral_reward_inviter_status
ON referral_reward_ledger(inviter_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_bonus_grants (
  id TEXT PRIMARY KEY,
  invitee_user_id TEXT NOT NULL UNIQUE,
  trigger_recharge_record_id TEXT NOT NULL UNIQUE,
  bonus_recharge_record_id TEXT UNIQUE,
  bonus_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  revoked_at INTEGER,
  revoke_recharge_record_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (invitee_user_id) REFERENCES users(id),
  FOREIGN KEY (trigger_recharge_record_id) REFERENCES recharge_records(id),
  FOREIGN KEY (bonus_recharge_record_id) REFERENCES recharge_records(id),
  FOREIGN KEY (revoke_recharge_record_id) REFERENCES recharge_records(id),
  CHECK (bonus_days > 0),
  CHECK (status IN ('pending', 'granted', 'revoked'))
);

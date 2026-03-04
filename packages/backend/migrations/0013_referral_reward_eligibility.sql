ALTER TABLE users ADD COLUMN referral_reward_eligible INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_referral_reward_eligible
ON users(referral_reward_eligible);

-- One-off fix for historical backfill reward retroactive unlock.
-- Target recharge_record_id: d53c91a0-44e5-4abe-b6a8-62b5d6b7a497
-- Safe to run once; if re-run, values are recalculated from current time.

BEGIN TRANSACTION;

WITH target AS (
  SELECT
    l.id AS reward_id,
    l.recharge_record_id,
    COALESCE(r.occurred_at, r.created_at) AS occurred_at,
    l.total_days,
    l.reward_amount_cents,
    l.withdrawn_amount_cents
  FROM referral_reward_ledger AS l
  INNER JOIN recharge_records AS r ON r.id = l.recharge_record_id
  WHERE l.recharge_record_id = 'd53c91a0-44e5-4abe-b6a8-62b5d6b7a497'
  LIMIT 1
),
calc AS (
  SELECT
    reward_id,
    recharge_record_id,
    occurred_at AS new_unlock_start_at,
    CASE
      WHEN total_days > 0 THEN occurred_at + total_days * 86400
      ELSE occurred_at
    END AS new_unlock_at,
    total_days,
    reward_amount_cents,
    withdrawn_amount_cents,
    CASE
      WHEN total_days <= 0 THEN 0
      WHEN unixepoch() <= occurred_at THEN 0
      WHEN CAST((unixepoch() - occurred_at) / 86400 AS INTEGER) >= total_days THEN total_days
      ELSE CAST((unixepoch() - occurred_at) / 86400 AS INTEGER)
    END AS new_unlocked_days
  FROM target
),
calc2 AS (
  SELECT
    reward_id,
    recharge_record_id,
    new_unlock_start_at,
    new_unlock_at,
    total_days,
    reward_amount_cents,
    withdrawn_amount_cents,
    new_unlocked_days,
    CASE
      WHEN total_days <= 0 THEN reward_amount_cents
      ELSE CAST((reward_amount_cents * new_unlocked_days) / total_days AS INTEGER)
    END AS new_unlocked_amount_cents
  FROM calc
)
UPDATE referral_reward_ledger
SET
  unlock_start_at = (SELECT new_unlock_start_at FROM calc2),
  unlock_at = (SELECT new_unlock_at FROM calc2),
  unlocked_days = (SELECT new_unlocked_days FROM calc2),
  unlocked_amount_cents = (SELECT new_unlocked_amount_cents FROM calc2),
  available_at = CASE
    WHEN available_at IS NULL AND (
      SELECT
        CASE
          WHEN
            (CASE
              WHEN reward_amount_cents < new_unlocked_amount_cents THEN reward_amount_cents
              ELSE new_unlocked_amount_cents
            END) > withdrawn_amount_cents
          THEN
            (CASE
              WHEN reward_amount_cents < new_unlocked_amount_cents THEN reward_amount_cents
              ELSE new_unlocked_amount_cents
            END) - withdrawn_amount_cents
          ELSE 0
        END
      FROM calc2
    ) > 0 THEN unixepoch()
    ELSE available_at
  END,
  fully_unlocked_at = CASE
    WHEN fully_unlocked_at IS NULL AND (
      SELECT new_unlocked_days >= total_days FROM calc2
    ) THEN unixepoch()
    ELSE fully_unlocked_at
  END,
  status = (
    SELECT
      CASE
        WHEN reward_amount_cents <= 0 THEN 'canceled'
        WHEN (
          CASE
            WHEN
              (CASE
                WHEN reward_amount_cents < new_unlocked_amount_cents THEN reward_amount_cents
                ELSE new_unlocked_amount_cents
              END) > withdrawn_amount_cents
            THEN
              (CASE
                WHEN reward_amount_cents < new_unlocked_amount_cents THEN reward_amount_cents
                ELSE new_unlocked_amount_cents
              END) - withdrawn_amount_cents
            ELSE 0
          END
        ) > 0 THEN 'available'
        WHEN reward_amount_cents - (
          CASE
            WHEN reward_amount_cents < new_unlocked_amount_cents THEN reward_amount_cents
            ELSE new_unlocked_amount_cents
          END
        ) > 0 THEN 'pending'
        ELSE 'withdrawn'
      END
    FROM calc2
  ),
  updated_at = unixepoch()
WHERE id = (SELECT reward_id FROM calc2);

COMMIT;

SELECT
  l.id,
  l.recharge_record_id,
  l.unlock_start_at,
  l.unlock_at,
  l.total_days,
  l.unlocked_days,
  l.reward_amount_cents,
  l.unlocked_amount_cents,
  l.withdrawn_amount_cents,
  l.status,
  l.available_at,
  l.fully_unlocked_at,
  l.updated_at
FROM referral_reward_ledger AS l
WHERE l.recharge_record_id = 'd53c91a0-44e5-4abe-b6a8-62b5d6b7a497';

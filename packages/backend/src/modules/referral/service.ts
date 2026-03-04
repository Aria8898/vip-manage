import {
  InviteRewardMode,
  RechargeReason,
  RechargeRecordSource,
  ReferralRewardStatus,
  type AdminReferralDashboardDTO
} from "@vip/shared";

export const REFERRAL_REWARD_RATE_BPS = 1000;
export const REFERRAL_BONUS_DAYS = 30;
export const REFERRAL_WITHDRAW_THRESHOLD_CENTS = 1000;

const SECONDS_PER_DAY = 24 * 60 * 60;

const REWARD_ELIGIBLE_REASONS = new Set<RechargeReason>([
  RechargeReason.WECHAT_PAY,
  RechargeReason.ALIPAY,
  RechargeReason.PLATFORM_ORDER
]);

const REWARD_ELIGIBLE_SOURCES = new Set<RechargeRecordSource>([
  RechargeRecordSource.NORMAL
]);

interface ReferralBindingRow {
  inviter_user_id: string;
  created_at: number;
}

interface BonusGrantRow {
  id: string;
  invitee_user_id: string;
  trigger_recharge_record_id: string;
  bonus_days: number;
}

interface RewardLotRow {
  id: string;
  inviter_user_id: string;
  payment_amount_cents: number;
  reward_rate_bps: number;
  reward_amount_cents: number;
  unlock_start_at: number;
  total_days: number;
  unlocked_days: number;
  unlocked_amount_cents: number;
  withdrawn_amount_cents: number;
  available_at: number | null;
  fully_unlocked_at: number | null;
  status: string;
}

interface RewardSummaryRow {
  inviter_user_id: string;
  pending_amount_cents: number | string | null;
  gross_available_amount_cents: number | string | null;
}

interface InviteeCountRow {
  inviter_user_id: string;
  invitee_count: number | string | null;
}

interface InviterDebtRow {
  id: string;
  referral_reward_debt_cents: number | string | null;
}

interface RewardLotWithdrawRow {
  id: string;
  reward_amount_cents: number;
  unlocked_amount_cents: number;
  withdrawn_amount_cents: number;
  status: string;
}

interface ReferralDashboardByInviterRow {
  inviter_user_id: string;
  pending_amount_cents: number | string | null;
  gross_available_amount_cents: number | string | null;
  pending_record_count: number | string | null;
  available_record_count: number | string | null;
}

interface WithdrawalTotalRow {
  withdrawn_amount_cents: number | string | null;
}

interface RewardRefundRow {
  id: string;
  inviter_user_id: string;
  payment_amount_cents: number;
  reward_rate_bps: number;
  reward_amount_cents: number;
  unlocked_amount_cents: number;
  withdrawn_amount_cents: number;
}

interface ReferralRewardEligibilityRow {
  referral_reward_eligible: number | string | null;
}

export interface ReferralBindSuccess {
  ok: true;
  inviterUserId: string;
  inviteeUserId: string;
  boundAt: number;
  alreadyBound: boolean;
}

export interface ReferralBindFail {
  ok: false;
  code:
    | "SELF_INVITE"
    | "INVITER_NOT_FOUND"
    | "INVITEE_NOT_FOUND"
    | "INVITEE_ALREADY_BOUND"
    | "RISK_REJECTED";
  message: string;
}

export type ReferralBindResult = ReferralBindSuccess | ReferralBindFail;

export interface CreateReferralRewardResult {
  created: boolean;
  inviterUserId: string | null;
  rewardAmountCents: number;
}

export interface WithdrawReferralRewardsResult {
  withdrawalId: string;
  withdrawnAmountCents: number;
  withdrawnCount: number;
  grossAmountCents: number;
  debtOffsetCents: number;
}

const toPositiveInt = (value: number | string | null | undefined): number =>
  Math.max(0, Number(value || 0));

const getEffectiveUnlockedCents = (row: {
  reward_amount_cents: number;
  unlocked_amount_cents: number;
}): number => {
  const rewardAmount = toPositiveInt(row.reward_amount_cents);
  const unlockedAmount = toPositiveInt(row.unlocked_amount_cents);
  return Math.min(rewardAmount, unlockedAmount);
};

const getWithdrawableCents = (row: {
  reward_amount_cents: number;
  unlocked_amount_cents: number;
  withdrawn_amount_cents: number;
}): number => {
  const effectiveUnlocked = getEffectiveUnlockedCents(row);
  const withdrawnAmount = toPositiveInt(row.withdrawn_amount_cents);
  return Math.max(effectiveUnlocked - withdrawnAmount, 0);
};

const getPendingCents = (row: {
  reward_amount_cents: number;
  unlocked_amount_cents: number;
}): number => {
  const rewardAmount = toPositiveInt(row.reward_amount_cents);
  const effectiveUnlocked = getEffectiveUnlockedCents(row);
  return Math.max(rewardAmount - effectiveUnlocked, 0);
};

const toReferralRewardStatus = (row: {
  reward_amount_cents: number;
  unlocked_amount_cents: number;
  withdrawn_amount_cents: number;
}): ReferralRewardStatus => {
  const rewardAmount = toPositiveInt(row.reward_amount_cents);
  if (rewardAmount <= 0) {
    return ReferralRewardStatus.CANCELED;
  }

  const withdrawable = getWithdrawableCents(row);
  if (withdrawable > 0) {
    return ReferralRewardStatus.AVAILABLE;
  }

  const pending = getPendingCents(row);
  if (pending > 0) {
    return ReferralRewardStatus.PENDING;
  }

  return ReferralRewardStatus.WITHDRAWN;
};

const calculateUnlockedAmountCents = (
  totalRewardCents: number,
  totalDays: number,
  unlockedDays: number
): number => {
  const reward = toPositiveInt(totalRewardCents);
  const days = toPositiveInt(totalDays);
  if (reward <= 0) {
    return 0;
  }
  if (days <= 0) {
    return reward;
  }

  const safeUnlockedDays = Math.min(toPositiveInt(unlockedDays), days);
  return Math.floor((reward * safeUnlockedDays) / days);
};

export const isReferralRewardEligible = (
  reason: RechargeReason,
  source: RechargeRecordSource,
  paymentAmountCents: number,
  options?: {
    allowBackfillReward?: boolean;
  }
): boolean =>
  paymentAmountCents > 0 &&
  REWARD_ELIGIBLE_REASONS.has(reason) &&
  (
    REWARD_ELIGIBLE_SOURCES.has(source) ||
    (source === RechargeRecordSource.BACKFILL && options?.allowBackfillReward === true)
  );

export const calculateRewardAmountCents = (
  paymentAmountCents: number,
  rewardRateBps = REFERRAL_REWARD_RATE_BPS
): number => {
  if (!Number.isInteger(paymentAmountCents) || paymentAmountCents <= 0) {
    return 0;
  }

  if (!Number.isInteger(rewardRateBps) || rewardRateBps <= 0) {
    return 0;
  }

  return Math.floor((paymentAmountCents * rewardRateBps) / 10000);
};

export const isInviterReferralRewardEligible = async (
  db: D1Database,
  inviterUserId: string,
  inviteRewardMode: InviteRewardMode
): Promise<boolean> => {
  if (inviteRewardMode === InviteRewardMode.PUBLIC) {
    return true;
  }

  const row = await db
    .prepare(
      `SELECT referral_reward_eligible
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(inviterUserId)
    .first<ReferralRewardEligibilityRow>();

  return toPositiveInt(row?.referral_reward_eligible) > 0;
};

export const bindUserReferral = async (
  db: D1Database,
  params: {
    inviterUserId: string;
    inviteeUserId: string;
    boundByAdminId?: string;
    now: number;
    checkProfileAbuse: boolean;
  }
): Promise<ReferralBindResult> => {
  const inviterUserId = params.inviterUserId.trim();
  const inviteeUserId = params.inviteeUserId.trim();

  if (inviterUserId === inviteeUserId) {
    return {
      ok: false,
      code: "SELF_INVITE",
      message: "inviter and invitee cannot be the same user"
    };
  }

  const inviter = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(inviterUserId)
    .first<{ id: string }>();
  if (!inviter) {
    return {
      ok: false,
      code: "INVITER_NOT_FOUND",
      message: "inviter user not found"
    };
  }

  const invitee = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(inviteeUserId)
    .first<{ id: string }>();
  if (!invitee) {
    return {
      ok: false,
      code: "INVITEE_NOT_FOUND",
      message: "invitee user not found"
    };
  }

  const existing = await db
    .prepare(
      "SELECT inviter_user_id, created_at FROM user_referrals WHERE invitee_user_id = ? LIMIT 1"
    )
    .bind(inviteeUserId)
    .first<ReferralBindingRow>();
  if (existing) {
    if (existing.inviter_user_id === inviterUserId) {
      return {
        ok: true,
        inviterUserId,
        inviteeUserId,
        boundAt: existing.created_at,
        alreadyBound: true
      };
    }

    return {
      ok: false,
      code: "INVITEE_ALREADY_BOUND",
      message: "invitee already has an inviter"
    };
  }

  if (params.checkProfileAbuse) {
    const abuseMatched = await db
      .prepare(
        `SELECT 1
         FROM users AS inviter
         INNER JOIN users AS invitee ON invitee.id = ?
         WHERE inviter.id = ?
           AND (
             (inviter.system_email IS NOT NULL AND inviter.system_email <> '' AND inviter.system_email = invitee.system_email)
             OR (inviter.user_email IS NOT NULL AND inviter.user_email <> '' AND inviter.user_email = invitee.user_email)
             OR (inviter.family_group_name IS NOT NULL AND inviter.family_group_name <> '' AND inviter.family_group_name = invitee.family_group_name)
           )
         LIMIT 1`
      )
      .bind(inviteeUserId, inviterUserId)
      .first<{ 1: number }>();

    if (abuseMatched) {
      return {
        ok: false,
        code: "RISK_REJECTED",
        message: "invitee profile collides with inviter, rejected by risk control"
      };
    }
  }

  const referralId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO user_referrals (
        id,
        inviter_user_id,
        invitee_user_id,
        bound_by_admin_id,
        created_at
      ) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      referralId,
      inviterUserId,
      inviteeUserId,
      params.boundByAdminId ?? null,
      params.now
    )
    .run();

  return {
    ok: true,
    inviterUserId,
    inviteeUserId,
    boundAt: params.now,
    alreadyBound: false
  };
};

const unlockRewardLots = async (
  db: D1Database,
  now: number,
  onlyRechargeRecordId?: string
): Promise<number> => {
  const rows = onlyRechargeRecordId
    ? await db
      .prepare(
        `SELECT
          id,
          inviter_user_id,
          payment_amount_cents,
          reward_rate_bps,
          reward_amount_cents,
          unlock_start_at,
          total_days,
          unlocked_days,
          unlocked_amount_cents,
          withdrawn_amount_cents,
          available_at,
          fully_unlocked_at,
          status
         FROM referral_reward_ledger
         WHERE recharge_record_id = ?
         LIMIT 1`
      )
      .bind(onlyRechargeRecordId)
      .all<RewardLotRow>()
    : await db
      .prepare(
        `SELECT
          id,
          inviter_user_id,
          payment_amount_cents,
          reward_rate_bps,
          reward_amount_cents,
          unlock_start_at,
          total_days,
          unlocked_days,
          unlocked_amount_cents,
          withdrawn_amount_cents,
          available_at,
          fully_unlocked_at,
          status
         FROM referral_reward_ledger
         WHERE status != ? AND total_days > 0 AND unlocked_days < total_days
         ORDER BY unlock_start_at ASC, id ASC`
      )
      .bind(ReferralRewardStatus.CANCELED)
      .all<RewardLotRow>();

  let changed = 0;
  const statements: D1PreparedStatement[] = [];

  for (const row of rows.results || []) {
    const totalDays = toPositiveInt(row.total_days);
    if (totalDays <= 0) {
      continue;
    }

    const unlockStartAt = toPositiveInt(row.unlock_start_at);
    const elapsedDays =
      unlockStartAt > 0 ? Math.max(Math.floor((now - unlockStartAt) / SECONDS_PER_DAY), 0) : 0;
    const targetUnlockedDays = Math.min(totalDays, elapsedDays);
    if (targetUnlockedDays <= toPositiveInt(row.unlocked_days)) {
      continue;
    }

    const targetUnlockedAmount = calculateUnlockedAmountCents(
      row.reward_amount_cents,
      totalDays,
      targetUnlockedDays
    );
    const nextUnlockedAmount = Math.max(toPositiveInt(row.unlocked_amount_cents), targetUnlockedAmount);
    const nextUnlockedDays = Math.max(toPositiveInt(row.unlocked_days), targetUnlockedDays);

    const nextStatus = toReferralRewardStatus({
      reward_amount_cents: row.reward_amount_cents,
      unlocked_amount_cents: nextUnlockedAmount,
      withdrawn_amount_cents: row.withdrawn_amount_cents
    });

    const nextAvailableAt =
      !row.available_at && getWithdrawableCents({
        reward_amount_cents: row.reward_amount_cents,
        unlocked_amount_cents: nextUnlockedAmount,
        withdrawn_amount_cents: row.withdrawn_amount_cents
      }) > 0
        ? now
        : row.available_at;
    const nextFullyUnlockedAt =
      !row.fully_unlocked_at && nextUnlockedDays >= totalDays ? now : row.fully_unlocked_at;

    statements.push(
      db.prepare(
        `UPDATE referral_reward_ledger
         SET unlocked_days = ?,
             unlocked_amount_cents = ?,
             available_at = ?,
             fully_unlocked_at = ?,
             status = ?,
             updated_at = ?
         WHERE id = ?`
      ).bind(
        nextUnlockedDays,
        nextUnlockedAmount,
        nextAvailableAt ?? null,
        nextFullyUnlockedAt ?? null,
        nextStatus,
        now,
        row.id
      )
    );
    changed += 1;
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }

  return changed;
};

export const createReferralRewardForRecharge = async (
  db: D1Database,
  params: {
    inviteeUserId: string;
    rechargeRecordId: string;
    rechargeReason: RechargeReason;
    rechargeSource: RechargeRecordSource;
    paymentAmountCents: number;
    totalDays: number;
    unlockStartAt: number;
    inviteRewardMode?: InviteRewardMode;
    allowBackfillReward?: boolean;
    now: number;
  }
): Promise<CreateReferralRewardResult> => {
  if (
    !isReferralRewardEligible(
      params.rechargeReason,
      params.rechargeSource,
      params.paymentAmountCents,
      {
        allowBackfillReward: params.allowBackfillReward
      }
    )
  ) {
    return {
      created: false,
      inviterUserId: null,
      rewardAmountCents: 0
    };
  }

  const referral = await db
    .prepare(
      "SELECT inviter_user_id, created_at FROM user_referrals WHERE invitee_user_id = ? LIMIT 1"
    )
    .bind(params.inviteeUserId)
    .first<ReferralBindingRow>();
  if (!referral) {
    return {
      created: false,
      inviterUserId: null,
      rewardAmountCents: 0
    };
  }

  const inviteRewardMode = params.inviteRewardMode ?? InviteRewardMode.ALLOWLIST;
  const inviterEligible = await isInviterReferralRewardEligible(
    db,
    referral.inviter_user_id,
    inviteRewardMode
  );
  if (!inviterEligible) {
    return {
      created: false,
      inviterUserId: referral.inviter_user_id,
      rewardAmountCents: 0
    };
  }

  const rewardAmountCents = calculateRewardAmountCents(params.paymentAmountCents);
  if (rewardAmountCents <= 0) {
    return {
      created: false,
      inviterUserId: referral.inviter_user_id,
      rewardAmountCents: 0
    };
  }

  const exists = await db
    .prepare("SELECT id FROM referral_reward_ledger WHERE recharge_record_id = ? LIMIT 1")
    .bind(params.rechargeRecordId)
    .first<{ id: string }>();
  if (exists) {
    return {
      created: false,
      inviterUserId: referral.inviter_user_id,
      rewardAmountCents
    };
  }

  const totalDays = Math.max(1, Math.floor(params.totalDays));
  const unlockStartAt = Math.max(params.unlockStartAt, 0);
  const fullUnlockAt = unlockStartAt + totalDays * SECONDS_PER_DAY;

  await db
    .prepare(
      `INSERT INTO referral_reward_ledger (
        id,
        inviter_user_id,
        invitee_user_id,
        recharge_record_id,
        recharge_reason,
        recharge_source,
        payment_amount_cents,
        reward_rate_bps,
        reward_amount_cents,
        status,
        unlock_at,
        unlock_start_at,
        total_days,
        unlocked_days,
        unlocked_amount_cents,
        withdrawn_amount_cents,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      referral.inviter_user_id,
      params.inviteeUserId,
      params.rechargeRecordId,
      params.rechargeReason,
      params.rechargeSource,
      params.paymentAmountCents,
      REFERRAL_REWARD_RATE_BPS,
      rewardAmountCents,
      ReferralRewardStatus.PENDING,
      fullUnlockAt,
      unlockStartAt,
      totalDays,
      params.now,
      params.now
    )
    .run();

  return {
    created: true,
    inviterUserId: referral.inviter_user_id,
    rewardAmountCents
  };
};

export const reserveInviteeBonusGrant = async (
  db: D1Database,
  params: {
    inviteeUserId: string;
    triggerRechargeRecordId: string;
    bonusDays: number;
    now: number;
  }
): Promise<boolean> => {
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO referral_bonus_grants (
        id,
        invitee_user_id,
        trigger_recharge_record_id,
        bonus_days,
        status,
        created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?)`
    )
    .bind(
      crypto.randomUUID(),
      params.inviteeUserId,
      params.triggerRechargeRecordId,
      params.bonusDays,
      params.now
    )
    .run();

  return Number(result.meta?.changes || 0) > 0;
};

export const confirmInviteeBonusGrant = async (
  db: D1Database,
  params: {
    inviteeUserId: string;
    bonusRechargeRecordId: string;
  }
): Promise<boolean> => {
  const result = await db
    .prepare(
      `UPDATE referral_bonus_grants
       SET bonus_recharge_record_id = ?, status = 'granted'
       WHERE invitee_user_id = ? AND status = 'pending'`
    )
    .bind(params.bonusRechargeRecordId, params.inviteeUserId)
    .run();

  return Number(result.meta?.changes || 0) > 0;
};

export const findGrantedBonusByTriggerRechargeRecord = async (
  db: D1Database,
  triggerRechargeRecordId: string
): Promise<BonusGrantRow | null> => {
  return db
    .prepare(
      `SELECT id, invitee_user_id, trigger_recharge_record_id, bonus_days
       FROM referral_bonus_grants
       WHERE trigger_recharge_record_id = ? AND status = 'granted'
       LIMIT 1`
    )
    .bind(triggerRechargeRecordId)
    .first<BonusGrantRow>();
};

export const markBonusGrantRevoked = async (
  db: D1Database,
  params: {
    bonusGrantId: string;
    revokeRechargeRecordId: string;
    now: number;
  }
): Promise<boolean> => {
  const result = await db
    .prepare(
      `UPDATE referral_bonus_grants
       SET status = 'revoked', revoked_at = ?, revoke_recharge_record_id = ?
       WHERE id = ? AND status = 'granted'`
    )
    .bind(params.now, params.revokeRechargeRecordId, params.bonusGrantId)
    .run();

  return Number(result.meta?.changes || 0) > 0;
};

export const cancelReferralRewardsByRechargeRecord = async (
  db: D1Database,
  params: {
    rechargeRecordId: string;
    refundAmountCents: number;
    reason: string;
    now: number;
  }
): Promise<number> => {
  await unlockRewardLots(db, params.now, params.rechargeRecordId);

  const rewardRow = await db
    .prepare(
      `SELECT
        id,
        inviter_user_id,
        payment_amount_cents,
        reward_rate_bps,
        reward_amount_cents,
        unlocked_amount_cents,
        withdrawn_amount_cents
       FROM referral_reward_ledger
       WHERE recharge_record_id = ?
       LIMIT 1`
    )
    .bind(params.rechargeRecordId)
    .first<RewardRefundRow>();
  if (!rewardRow) {
    return 0;
  }

  const netPaymentCents = Math.max(
    toPositiveInt(rewardRow.payment_amount_cents) - toPositiveInt(params.refundAmountCents),
    0
  );
  const nextRewardAmountCents = calculateRewardAmountCents(
    netPaymentCents,
    toPositiveInt(rewardRow.reward_rate_bps) || REFERRAL_REWARD_RATE_BPS
  );

  const nextStatus = toReferralRewardStatus({
    reward_amount_cents: nextRewardAmountCents,
    unlocked_amount_cents: rewardRow.unlocked_amount_cents,
    withdrawn_amount_cents: rewardRow.withdrawn_amount_cents
  });

  const consumedAmount = toPositiveInt(rewardRow.withdrawn_amount_cents);
  const overPaidAmount = Math.max(consumedAmount - nextRewardAmountCents, 0);

  const statements: D1PreparedStatement[] = [];
  statements.push(
    db.prepare(
      `UPDATE referral_reward_ledger
       SET reward_amount_cents = ?,
           status = ?,
           canceled_at = CASE WHEN ? <= 0 THEN ? ELSE canceled_at END,
           canceled_reason = CASE WHEN ? <= 0 THEN ? ELSE canceled_reason END,
           updated_at = ?
       WHERE id = ?`
    ).bind(
      nextRewardAmountCents,
      nextStatus,
      nextRewardAmountCents,
      params.now,
      nextRewardAmountCents,
      params.reason,
      params.now,
      rewardRow.id
    )
  );

  if (overPaidAmount > 0) {
    statements.push(
      db.prepare(
        `UPDATE users
         SET referral_reward_debt_cents = referral_reward_debt_cents + ?,
             updated_at = ?
         WHERE id = ?`
      ).bind(overPaidAmount, params.now, rewardRow.inviter_user_id)
    );
  }

  await db.batch(statements);
  return Number(overPaidAmount > 0 ? 2 : 1);
};

export const unlockPendingReferralRewards = async (
  db: D1Database,
  now: number
): Promise<number> => {
  return unlockRewardLots(db, now);
};

export const summarizeReferralRewardsByInviter = async (
  db: D1Database,
  inviterUserIds: string[]
): Promise<Map<string, {
  pendingAmountCents: number;
  grossAvailableAmountCents: number;
  availableAmountCents: number;
  rewardDebtCents: number;
}>> => {
  const uniqueIds = Array.from(new Set(inviterUserIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT
        inviter_user_id,
        COALESCE(SUM(
          CASE
            WHEN status = '${ReferralRewardStatus.CANCELED}' OR reward_amount_cents <= 0 THEN 0
            ELSE reward_amount_cents -
              (CASE
                WHEN unlocked_amount_cents < reward_amount_cents THEN unlocked_amount_cents
                ELSE reward_amount_cents
              END)
          END
        ), 0) AS pending_amount_cents,
        COALESCE(SUM(
          CASE
            WHEN status = '${ReferralRewardStatus.CANCELED}' OR reward_amount_cents <= 0 THEN 0
            ELSE
              CASE
                WHEN
                  (CASE
                    WHEN unlocked_amount_cents < reward_amount_cents THEN unlocked_amount_cents
                    ELSE reward_amount_cents
                  END) > withdrawn_amount_cents
                THEN
                  (CASE
                    WHEN unlocked_amount_cents < reward_amount_cents THEN unlocked_amount_cents
                    ELSE reward_amount_cents
                  END) - withdrawn_amount_cents
                ELSE 0
              END
          END
        ), 0) AS gross_available_amount_cents
       FROM referral_reward_ledger
       WHERE inviter_user_id IN (${placeholders})
       GROUP BY inviter_user_id`
    )
    .bind(...uniqueIds)
    .all<RewardSummaryRow>();

  const debtRows = await db
    .prepare(
      `SELECT id, referral_reward_debt_cents
       FROM users
       WHERE id IN (${placeholders})`
    )
    .bind(...uniqueIds)
    .all<InviterDebtRow>();
  const debtMap = new Map(
    (debtRows.results || []).map((row) => [
      row.id,
      toPositiveInt(row.referral_reward_debt_cents)
    ])
  );
  const summaryMap = new Map(
    (rows.results || []).map((row) => [
      row.inviter_user_id,
      {
        pendingAmountCents: toPositiveInt(row.pending_amount_cents),
        grossAvailableAmountCents: toPositiveInt(row.gross_available_amount_cents)
      }
    ])
  );

  const result = new Map<string, {
    pendingAmountCents: number;
    grossAvailableAmountCents: number;
    availableAmountCents: number;
    rewardDebtCents: number;
  }>();

  for (const inviterUserId of uniqueIds) {
    const summary = summaryMap.get(inviterUserId);
    const pendingAmountCents = summary?.pendingAmountCents || 0;
    const grossAvailableAmountCents = summary?.grossAvailableAmountCents || 0;
    const rewardDebtCents = debtMap.get(inviterUserId) || 0;
    const availableAmountCents = Math.max(
      grossAvailableAmountCents - rewardDebtCents,
      0
    );

    result.set(inviterUserId, {
      pendingAmountCents,
      grossAvailableAmountCents,
      availableAmountCents,
      rewardDebtCents
    });
  }

  return result;
};

export const countInviteesByInviter = async (
  db: D1Database,
  inviterUserIds: string[]
): Promise<Map<string, number>> => {
  const uniqueIds = Array.from(new Set(inviterUserIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT inviter_user_id, COUNT(*) AS invitee_count
       FROM user_referrals
       WHERE inviter_user_id IN (${placeholders})
       GROUP BY inviter_user_id`
    )
    .bind(...uniqueIds)
    .all<InviteeCountRow>();

  return new Map(
    (rows.results || []).map((row) => [
      row.inviter_user_id,
      Number(row.invitee_count || 0)
    ])
  );
};

export const withdrawAvailableReferralRewards = async (
  db: D1Database,
  params: {
    inviterUserId: string;
    processedByAdminId: string;
    note: string | null;
    now: number;
  }
): Promise<WithdrawReferralRewardsResult | null> => {
  await unlockRewardLots(db, params.now);

  const inviter = await db
    .prepare(
      `SELECT id, referral_reward_debt_cents
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(params.inviterUserId)
    .first<InviterDebtRow>();
  if (!inviter) {
    return null;
  }

  const lots = await db
    .prepare(
      `SELECT
        id,
        reward_amount_cents,
        unlocked_amount_cents,
        withdrawn_amount_cents,
       status
       FROM referral_reward_ledger
       WHERE inviter_user_id = ? AND status != ?
       ORDER BY created_at ASC, id ASC`
    )
    .bind(params.inviterUserId, ReferralRewardStatus.CANCELED)
    .all<RewardLotWithdrawRow>();

  const lotAvailability = (lots.results || [])
    .map((row) => ({
      id: row.id,
      status: row.status,
      rewardAmountCents: toPositiveInt(row.reward_amount_cents),
      unlockedAmountCents: toPositiveInt(row.unlocked_amount_cents),
      withdrawnAmountCents: toPositiveInt(row.withdrawn_amount_cents),
      availableAmountCents: getWithdrawableCents({
        reward_amount_cents: row.reward_amount_cents,
        unlocked_amount_cents: row.unlocked_amount_cents,
        withdrawn_amount_cents: row.withdrawn_amount_cents
      })
    }))
    .filter((row) => row.availableAmountCents > 0);

  if (lotAvailability.length === 0) {
    return null;
  }

  const grossAmountCents = lotAvailability.reduce(
    (sum, row) => sum + row.availableAmountCents,
    0
  );
  const rewardDebtCents = toPositiveInt(inviter.referral_reward_debt_cents);
  const netWithdrawableAmountCents = Math.max(grossAmountCents - rewardDebtCents, 0);

  if (netWithdrawableAmountCents < REFERRAL_WITHDRAW_THRESHOLD_CENTS) {
    return null;
  }

  const debtOffsetCents = Math.min(rewardDebtCents, grossAmountCents);
  const nextDebtCents = rewardDebtCents - debtOffsetCents;

  const statements: D1PreparedStatement[] = [];
  const withdrawalId = crypto.randomUUID();
  statements.push(
    db.prepare(
      `INSERT INTO referral_withdrawals (
        id,
        inviter_user_id,
        amount_cents,
        debt_offset_cents,
        gross_amount_cents,
        processed_by_admin_id,
        note,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      withdrawalId,
      params.inviterUserId,
      netWithdrawableAmountCents,
      debtOffsetCents,
      grossAmountCents,
      params.processedByAdminId,
      params.note,
      params.now
    )
  );

  statements.push(
    db.prepare(
      `UPDATE users
       SET referral_reward_debt_cents = ?,
           updated_at = ?
       WHERE id = ?`
    ).bind(nextDebtCents, params.now, params.inviterUserId)
  );

  for (const lot of lotAvailability) {
    const nextWithdrawnAmountCents = lot.withdrawnAmountCents + lot.availableAmountCents;
    const nextStatus = toReferralRewardStatus({
      reward_amount_cents: lot.rewardAmountCents,
      unlocked_amount_cents: lot.unlockedAmountCents,
      withdrawn_amount_cents: nextWithdrawnAmountCents
    });
    statements.push(
      db.prepare(
        `UPDATE referral_reward_ledger
         SET withdrawn_amount_cents = ?,
             withdrawn_at = ?,
             withdrawal_id = ?,
             status = ?,
             updated_at = ?
         WHERE id = ?`
      ).bind(
        nextWithdrawnAmountCents,
        params.now,
        withdrawalId,
        nextStatus,
        params.now,
        lot.id
      )
    );
  }

  await db.batch(statements);

  return {
    withdrawalId,
    withdrawnAmountCents: netWithdrawableAmountCents,
    withdrawnCount: lotAvailability.length,
    grossAmountCents,
    debtOffsetCents
  };
};

export const getReferralDashboard = async (
  db: D1Database
): Promise<AdminReferralDashboardDTO> => {
  const rows = await db
    .prepare(
      `SELECT
        l.inviter_user_id,
        COALESCE(SUM(
          CASE
            WHEN l.status = '${ReferralRewardStatus.CANCELED}' OR l.reward_amount_cents <= 0 THEN 0
            ELSE l.reward_amount_cents -
              (CASE
                WHEN l.unlocked_amount_cents < l.reward_amount_cents THEN l.unlocked_amount_cents
                ELSE l.reward_amount_cents
              END)
          END
        ), 0) AS pending_amount_cents,
        COALESCE(SUM(
          CASE
            WHEN l.status = '${ReferralRewardStatus.CANCELED}' OR l.reward_amount_cents <= 0 THEN 0
            ELSE
              CASE
                WHEN
                  (CASE
                    WHEN l.unlocked_amount_cents < l.reward_amount_cents THEN l.unlocked_amount_cents
                    ELSE l.reward_amount_cents
                  END) > l.withdrawn_amount_cents
                THEN
                  (CASE
                    WHEN l.unlocked_amount_cents < l.reward_amount_cents THEN l.unlocked_amount_cents
                    ELSE l.reward_amount_cents
                  END) - l.withdrawn_amount_cents
                ELSE 0
              END
          END
        ), 0) AS gross_available_amount_cents,
        COALESCE(SUM(CASE WHEN l.status != '${ReferralRewardStatus.CANCELED}' AND l.reward_amount_cents > 0 AND (l.reward_amount_cents -
          (CASE WHEN l.unlocked_amount_cents < l.reward_amount_cents THEN l.unlocked_amount_cents ELSE l.reward_amount_cents END)
        ) > 0 THEN 1 ELSE 0 END), 0) AS pending_record_count,
        COALESCE(SUM(CASE WHEN l.status != '${ReferralRewardStatus.CANCELED}' AND l.reward_amount_cents > 0 AND (
          (CASE WHEN l.unlocked_amount_cents < l.reward_amount_cents THEN l.unlocked_amount_cents ELSE l.reward_amount_cents END) - l.withdrawn_amount_cents
        ) > 0 THEN 1 ELSE 0 END), 0) AS available_record_count
       FROM referral_reward_ledger AS l
       GROUP BY l.inviter_user_id`
    )
    .all<ReferralDashboardByInviterRow>();

  const inviterIds = (rows.results || []).map((row) => row.inviter_user_id);
  const debtMap = new Map<string, number>();
  if (inviterIds.length > 0) {
    const placeholders = inviterIds.map(() => "?").join(", ");
    const debtRows = await db
      .prepare(
        `SELECT id, referral_reward_debt_cents
         FROM users
         WHERE id IN (${placeholders})`
      )
      .bind(...inviterIds)
      .all<InviterDebtRow>();
    for (const row of debtRows.results || []) {
      debtMap.set(row.id, toPositiveInt(row.referral_reward_debt_cents));
    }
  }

  let pendingAmountCents = 0;
  let grossAvailableAmountCents = 0;
  let availableAmountCents = 0;
  let debtAmountCents = 0;
  let pendingCount = 0;
  let availableCount = 0;

  for (const row of rows.results || []) {
    const inviterPending = toPositiveInt(row.pending_amount_cents);
    const inviterGrossAvailable = toPositiveInt(row.gross_available_amount_cents);
    const inviterDebt = debtMap.get(row.inviter_user_id) || 0;

    pendingAmountCents += inviterPending;
    grossAvailableAmountCents += inviterGrossAvailable;
    availableAmountCents += Math.max(inviterGrossAvailable - inviterDebt, 0);
    pendingCount += Number(row.pending_record_count || 0);
    availableCount += Number(row.available_record_count || 0);
  }

  const totalDebtRow = await db
    .prepare(
      `SELECT COALESCE(SUM(referral_reward_debt_cents), 0) AS total_debt_cents
       FROM users
       WHERE referral_reward_debt_cents > 0`
    )
    .first<{ total_debt_cents: number | string | null }>();
  debtAmountCents = toPositiveInt(totalDebtRow?.total_debt_cents);

  const withdrawnRow = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS withdrawn_amount_cents
       FROM referral_withdrawals`
    )
    .first<WithdrawalTotalRow>();
  const withdrawnAmountCents = toPositiveInt(withdrawnRow?.withdrawn_amount_cents);

  return {
    pendingAmount: Number((pendingAmountCents / 100).toFixed(2)),
    availableAmount: Number((availableAmountCents / 100).toFixed(2)),
    withdrawnAmount: Number((withdrawnAmountCents / 100).toFixed(2)),
    grossAvailableAmount: Number((grossAvailableAmountCents / 100).toFixed(2)),
    debtAmount: Number((debtAmountCents / 100).toFixed(2)),
    withdrawThresholdAmount: Number((REFERRAL_WITHDRAW_THRESHOLD_CENTS / 100).toFixed(2)),
    pendingCount,
    availableCount
  };
};

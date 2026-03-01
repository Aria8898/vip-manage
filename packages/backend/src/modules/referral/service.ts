import {
  RechargeReason,
  RechargeRecordSource,
  ReferralRewardStatus,
  type AdminReferralDashboardDTO
} from "@vip/shared";

export const REFERRAL_REWARD_RATE_BPS = 1000;
export const REFERRAL_BONUS_DAYS = 30;

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

interface RewardSummaryRow {
  inviter_user_id: string;
  pending_amount_cents: number | string | null;
  available_amount_cents: number | string | null;
}

interface InviteeCountRow {
  inviter_user_id: string;
  invitee_count: number | string | null;
}

interface WithdrawableRewardRow {
  id: string;
  reward_amount_cents: number;
}

interface ReferralDashboardRow {
  pending_amount_cents: number | string | null;
  available_amount_cents: number | string | null;
  withdrawn_amount_cents: number | string | null;
  pending_count: number | string | null;
  available_count: number | string | null;
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
}

export const isReferralRewardEligible = (
  reason: RechargeReason,
  source: RechargeRecordSource,
  paymentAmountCents: number
): boolean =>
  paymentAmountCents > 0 &&
  REWARD_ELIGIBLE_REASONS.has(reason) &&
  REWARD_ELIGIBLE_SOURCES.has(source);

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

export const createReferralRewardForRecharge = async (
  db: D1Database,
  params: {
    inviteeUserId: string;
    rechargeRecordId: string;
    rechargeReason: RechargeReason;
    rechargeSource: RechargeRecordSource;
    paymentAmountCents: number;
    unlockAt: number;
    now: number;
  }
): Promise<CreateReferralRewardResult> => {
  if (
    !isReferralRewardEligible(
      params.rechargeReason,
      params.rechargeSource,
      params.paymentAmountCents
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
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      params.unlockAt,
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
    reason: string;
    now: number;
  }
): Promise<number> => {
  const result = await db
    .prepare(
      `UPDATE referral_reward_ledger
       SET status = ?, canceled_at = ?, canceled_reason = ?, updated_at = ?
       WHERE recharge_record_id = ? AND status IN (?, ?)`
    )
    .bind(
      ReferralRewardStatus.CANCELED,
      params.now,
      params.reason,
      params.now,
      params.rechargeRecordId,
      ReferralRewardStatus.PENDING,
      ReferralRewardStatus.AVAILABLE
    )
    .run();

  return Number(result.meta?.changes || 0);
};

export const unlockPendingReferralRewards = async (
  db: D1Database,
  now: number
): Promise<number> => {
  const result = await db
    .prepare(
      `UPDATE referral_reward_ledger
       SET status = ?, available_at = ?, updated_at = ?
       WHERE status = ? AND unlock_at <= ?`
    )
    .bind(
      ReferralRewardStatus.AVAILABLE,
      now,
      now,
      ReferralRewardStatus.PENDING,
      now
    )
    .run();

  return Number(result.meta?.changes || 0);
};

export const summarizeReferralRewardsByInviter = async (
  db: D1Database,
  inviterUserIds: string[]
): Promise<Map<string, { pendingAmountCents: number; availableAmountCents: number }>> => {
  const uniqueIds = Array.from(new Set(inviterUserIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(
      `SELECT
        inviter_user_id,
        COALESCE(SUM(CASE WHEN status = '${ReferralRewardStatus.PENDING}' THEN reward_amount_cents ELSE 0 END), 0) AS pending_amount_cents,
        COALESCE(SUM(CASE WHEN status = '${ReferralRewardStatus.AVAILABLE}' THEN reward_amount_cents ELSE 0 END), 0) AS available_amount_cents
       FROM referral_reward_ledger
       WHERE inviter_user_id IN (${placeholders})
       GROUP BY inviter_user_id`
    )
    .bind(...uniqueIds)
    .all<RewardSummaryRow>();

  return new Map(
    (rows.results || []).map((row) => [
      row.inviter_user_id,
      {
        pendingAmountCents: Number(row.pending_amount_cents || 0),
        availableAmountCents: Number(row.available_amount_cents || 0)
      }
    ])
  );
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
  const rows = await db
    .prepare(
      `SELECT id, reward_amount_cents
       FROM referral_reward_ledger
       WHERE inviter_user_id = ? AND status = ?
       ORDER BY created_at ASC, id ASC`
    )
    .bind(params.inviterUserId, ReferralRewardStatus.AVAILABLE)
    .all<WithdrawableRewardRow>();

  const items = rows.results || [];
  if (items.length === 0) {
    return null;
  }

  const withdrawnAmountCents = items.reduce(
    (sum, row) => sum + Number(row.reward_amount_cents || 0),
    0
  );
  if (withdrawnAmountCents <= 0) {
    return null;
  }

  const withdrawalId = crypto.randomUUID();
  const rewardIds = items.map((item) => item.id);
  const placeholders = rewardIds.map(() => "?").join(", ");

  await db
    .prepare(
      `INSERT INTO referral_withdrawals (
        id,
        inviter_user_id,
        amount_cents,
        processed_by_admin_id,
        note,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      withdrawalId,
      params.inviterUserId,
      withdrawnAmountCents,
      params.processedByAdminId,
      params.note,
      params.now
    )
    .run();

  await db
    .prepare(
      `UPDATE referral_reward_ledger
       SET status = ?, withdrawn_at = ?, withdrawal_id = ?, updated_at = ?
       WHERE id IN (${placeholders}) AND status = ?`
    )
    .bind(
      ReferralRewardStatus.WITHDRAWN,
      params.now,
      withdrawalId,
      params.now,
      ...rewardIds,
      ReferralRewardStatus.AVAILABLE
    )
    .run();

  return {
    withdrawalId,
    withdrawnAmountCents,
    withdrawnCount: rewardIds.length
  };
};

export const getReferralDashboard = async (
  db: D1Database
): Promise<AdminReferralDashboardDTO> => {
  const row = await db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN status = '${ReferralRewardStatus.PENDING}' THEN reward_amount_cents ELSE 0 END), 0) AS pending_amount_cents,
        COALESCE(SUM(CASE WHEN status = '${ReferralRewardStatus.AVAILABLE}' THEN reward_amount_cents ELSE 0 END), 0) AS available_amount_cents,
        COALESCE(SUM(CASE WHEN status = '${ReferralRewardStatus.WITHDRAWN}' THEN reward_amount_cents ELSE 0 END), 0) AS withdrawn_amount_cents,
        COALESCE(SUM(CASE WHEN status = '${ReferralRewardStatus.PENDING}' THEN 1 ELSE 0 END), 0) AS pending_count,
        COALESCE(SUM(CASE WHEN status = '${ReferralRewardStatus.AVAILABLE}' THEN 1 ELSE 0 END), 0) AS available_count
       FROM referral_reward_ledger`
    )
    .first<ReferralDashboardRow>();

  return {
    pendingAmount: Number((Number(row?.pending_amount_cents || 0) / 100).toFixed(2)),
    availableAmount: Number((Number(row?.available_amount_cents || 0) / 100).toFixed(2)),
    withdrawnAmount: Number((Number(row?.withdrawn_amount_cents || 0) / 100).toFixed(2)),
    pendingCount: Number(row?.pending_count || 0),
    availableCount: Number(row?.available_count || 0)
  };
};

import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sign, verify } from "hono/jwt";
import {
  MembershipStatus,
  ReferralRewardStatus,
  RechargeReason,
  RechargeRecordSource,
  UserProfileChangeField,
  type AdminBindUserReferralRequestDTO,
  type AdminBindUserReferralResponseDTO,
  type AdminBackfillRechargeRequestDTO,
  type AdminCreateUserRequestDTO,
  type AdminCreateUserResponseDTO,
  type AdminDashboardTodayDTO,
  type AdminListReferralRewardsResponseDTO,
  type AdminListReferralWithdrawalsResponseDTO,
  type AdminListUserProfileChangeLogsResponseDTO,
  type AdminListRechargeRecordsResponseDTO,
  type AdminRefundRechargeRequestDTO,
  type AdminRefundRechargeResponseDTO,
  type AdminReferralDashboardDTO,
  type AdminReferralRewardRecordDTO,
  type AdminReferralWithdrawalDTO,
  type AdminResetUserTokenResponseDTO,
  type AdminListUsersResponseDTO,
  type AdminLoginRequestDTO,
  type AdminLoginResponseDTO,
  type AdminRechargeRecordDTO,
  type AdminRechargeUserRequestDTO,
  type AdminRechargeUserResponseDTO,
  type AdminSessionDTO,
  type AdminUpdateUserRequestDTO,
  type AdminUpdateUserInviteCodeRequestDTO,
  type AdminUpdateUserInviteCodeResponseDTO,
  type AdminUpdateUserResponseDTO,
  type AdminUserDTO,
  type AdminUserProfileChangeRecordDTO,
  type AdminWithdrawReferralRewardsRequestDTO,
  type AdminWithdrawReferralRewardsResponseDTO,
  type ApiResponse,
  type HealthDTO,
  type UserStatusHistoryRecordDTO,
  type UserStatusResponseDTO
} from "@vip/shared";

import { createRequestId } from "./lib/request-id";
import {
  checkLoginLimit,
  clearLoginLimit,
  recordFailedLogin
} from "./lib/login-failure-rate-limit";
import { verifyPasswordHash } from "./lib/password-hash";
import {
  REFERRAL_BONUS_DAYS,
  bindUserReferral,
  cancelReferralRewardsByRechargeRecord,
  confirmInviteeBonusGrant,
  countInviteesByInviter,
  createReferralRewardForRecharge,
  findGrantedBonusByTriggerRechargeRecord,
  getReferralDashboard,
  markBonusGrantRevoked,
  reserveInviteeBonusGrant,
  summarizeReferralRewardsByInviter,
  unlockPendingReferralRewards,
  withdrawAvailableReferralRewards
} from "./modules/referral/service";

type Bindings = {
  DB: D1Database;
  APP_ENV?: string;
  JWT_SECRET?: string;
  USER_TOKEN_SECRET?: string;
  ADMIN_SESSION_TTL_SECONDS?: string;
};

type AdminSessionContext = {
  adminId: string;
  username: string;
  expiresAt: number;
};

type Variables = {
  requestId: string;
  adminSession: AdminSessionContext;
};

const ADMIN_SESSION_COOKIE = "vip_admin_session";
const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_USER_TOKEN_VERSION = 1;
const DEFAULT_RECHARGE_RECORD_LIMIT = 100;
const MAX_RECHARGE_RECORD_LIMIT = 200;
const DEFAULT_PROFILE_CHANGE_LOG_LIMIT = 100;
const MAX_PROFILE_CHANGE_LOG_LIMIT = 200;
const DEFAULT_STATUS_HISTORY_LIMIT = 50;
const USER_LIST_LIMIT = 100;
const MAX_USERNAME_LENGTH = 80;
const MAX_FAMILY_GROUP_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 120;
const MAX_INTERNAL_NOTE_LENGTH = 200;
const MAX_EXTERNAL_NOTE_LENGTH = 200;
const MAX_PROFILE_CHANGE_NOTE_LENGTH = 200;
const MAX_REFUND_NOTE_LENGTH = 200;
const MAX_WITHDRAW_NOTE_LENGTH = 200;
const MAX_RECHARGE_DAYS = 3650;
const MAX_PAYMENT_AMOUNT = 1000000;
const SYSTEM_INVITE_CODE_LENGTH = 8;
const MIN_CUSTOM_INVITE_CODE_LENGTH = 4;
const MAX_CUSTOM_INVITE_CODE_LENGTH = 32;
const SECONDS_PER_DAY = 24 * 60 * 60;
const UTC8_OFFSET_SECONDS = 8 * 60 * 60;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]+$/u;
const SYSTEM_INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const COMPACT_USER_TOKEN_MARKER = 2;
const COMPACT_USER_TOKEN_SIGNATURE_BYTES = 16;
type HttpStatus = 200 | 400 | 401 | 404 | 409 | 429 | 500;

interface AdminUserRow {
  id: string;
  username: string;
  password_hash: string;
}

interface UserRow {
  id: string;
  username: string;
  system_email?: string | null;
  family_group_name?: string | null;
  user_email?: string | null;
  system_invite_code?: string | null;
  custom_invite_code?: string | null;
  expire_at: number;
  created_at: number;
  updated_at: number;
  token_version?: number;
  access_token_hash?: string;
}

interface InviteAliasRow {
  id: string;
  user_id: string;
  alias: string;
  alias_normalized: string;
  status: string;
}

interface InviteCodeResolvedUserRow {
  id: string;
}

interface SqliteTableInfoRow {
  name: string;
}

interface RechargeTargetUserRow {
  id: string;
  username: string;
  expire_at: number;
  updated_at?: number;
}

interface RechargeRecordRow {
  id: string;
  user_id: string;
  username: string;
  change_days: number;
  reason: string;
  payment_amount_cents: number | null;
  internal_note: string | null;
  external_note: string | null;
  expire_before: number;
  expire_after: number;
  operator_admin_id: string;
  operator_admin_username: string;
  occurred_at: number | null;
  recorded_at: number | null;
  source: string | null;
  refunded_at: number | null;
  refunded_by_admin_id: string | null;
  refund_amount_cents: number | null;
  refund_note: string | null;
  created_at: number;
}

interface RechargeRecordForRefundRow {
  id: string;
  user_id: string;
  reason: string;
  source: string | null;
  change_days: number;
  payment_amount_cents: number | null;
  expire_before: number;
  expire_after: number;
  refunded_at: number | null;
}

interface RechargeRefundTargetWithUserRow extends RechargeRecordForRefundRow {
  username: string;
}

interface RefundUsageSnapshot {
  usedDays: number;
  refundableDays: number;
  refundableAmountCents: number;
}

interface UserProfileChangeLogRow {
  id: string;
  change_batch_id: string;
  user_id: string;
  username: string;
  field_name: string;
  before_value: string | null;
  after_value: string | null;
  change_note: string;
  operator_admin_id: string;
  operator_admin_username: string;
  created_at: number;
}

interface DashboardTodayRow {
  recharge_count: number | string | null;
  total_change_days: number | string | null;
}

interface UserReferralRow {
  invitee_user_id: string;
  inviter_user_id: string;
  inviter_username: string;
}

interface ReferralRewardLedgerRow {
  id: string;
  inviter_user_id: string;
  inviter_username: string;
  invitee_user_id: string;
  invitee_username: string;
  recharge_record_id: string;
  recharge_reason: string;
  recharge_source: string;
  payment_amount_cents: number;
  reward_rate_bps: number;
  reward_amount_cents: number;
  unlock_start_at: number;
  total_days: number;
  unlocked_days: number;
  unlocked_amount_cents: number;
  withdrawn_amount_cents: number;
  status: string;
  unlock_at: number;
  available_at: number | null;
  fully_unlocked_at: number | null;
  canceled_at: number | null;
  canceled_reason: string | null;
  withdrawn_at: number | null;
  withdrawal_id: string | null;
  created_at: number;
  updated_at: number;
}

interface ReferralWithdrawalRow {
  id: string;
  inviter_user_id: string;
  inviter_username: string;
  amount_cents: number;
  gross_amount_cents: number;
  debt_offset_cents: number;
  processed_by_admin_id: string;
  processed_by_admin_username: string;
  note: string | null;
  created_at: number;
}

interface UserTotalChangeDaysRow {
  total_change_days: number | string | null;
}

interface UserReferralSummaryRow {
  pending_amount_cents: number | string | null;
  gross_available_amount_cents: number | string | null;
  withdrawn_amount_cents: number | string | null;
  reward_debt_cents: number | string | null;
}

interface UserInviteeCountRow {
  invitee_count: number | string | null;
}

interface UserInviteeRewardSummaryRow {
  invitee_user_id: string;
  invitee_username: string;
  pending_amount_cents: number | string | null;
  available_amount_cents: number | string | null;
  withdrawn_amount_cents: number | string | null;
  reward_amount_cents: number | string | null;
}

interface RechargeRebuildRow {
  id: string;
  change_days: number;
  occurred_at: number;
  expire_before: number;
  expire_after: number;
}

interface UserStatusRow {
  id: string;
  username: string;
  user_email?: string | null;
  expire_at: number;
}

interface UserStatusHistoryRow {
  id: string;
  change_days: number;
  reason: string;
  payment_amount_cents: number | null;
  external_note: string | null;
  expire_before: number;
  expire_after: number;
  occurred_at: number | null;
  created_at: number;
}

interface ResetTokenTargetUserRow {
  id: string;
  username: string;
  system_email?: string | null;
  family_group_name?: string | null;
  user_email?: string | null;
  expire_at: number;
  created_at: number;
  token_version: number;
  access_token_hash: string;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;
let cachedHasUsersTokenVersionColumn: boolean | null = null;
let cachedHasUsersExtraProfileColumns: boolean | null = null;
let cachedHasRechargeTimelineColumns: boolean | null = null;
let cachedHasRechargeExternalNoteColumn: boolean | null = null;
let cachedHasRechargeRefundColumns: boolean | null = null;
let cachedHasReferralTables: boolean | null = null;
let cachedHasReferralDailyUnlockColumns: boolean | null = null;
let cachedHasUsersInviteCodeColumn: boolean | null = null;
let cachedHasInviteAliasesTable: boolean | null = null;

const getCurrentTimestamp = (): number => Math.floor(Date.now() / 1000);

const parseSessionTtlSeconds = (value: string | undefined): number => {
  const fallback = DEFAULT_SESSION_TTL_SECONDS;
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
};

const getClientIp = (request: Request): string => {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim() || "unknown";
  }

  return "unknown";
};

const shouldUseSecureCookie = (request: Request, env: Bindings): boolean => {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.toLowerCase().includes("https");
  }

  if (request.url.startsWith("https://")) {
    return true;
  }

  return env.APP_ENV === "production";
};

const getJwtSecret = (env: Bindings): string | null => {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    return null;
  }
  return env.JWT_SECRET;
};

const getUserTokenSecret = (env: Bindings): string | null => {
  if (env.USER_TOKEN_SECRET && env.USER_TOKEN_SECRET.length >= 32) {
    return env.USER_TOKEN_SECRET;
  }

  return getJwtSecret(env);
};

const toBase64Url = (input: Uint8Array): string => {
  let binary = "";
  for (let index = 0; index < input.length; index += 1) {
    binary += String.fromCharCode(input[index] as number);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const encodeUtf8Base64Url = (input: string): string => {
  const encoded = new TextEncoder().encode(input);
  return toBase64Url(encoded);
};

const parseUuidToBytes = (uuid: string): Uint8Array | null => {
  const normalized = uuid.trim().toLowerCase().replaceAll("-", "");
  if (!/^[0-9a-f]{32}$/u.test(normalized)) {
    return null;
  }

  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    const offset = index * 2;
    bytes[index] = Number.parseInt(normalized.slice(offset, offset + 2), 16);
  }

  return bytes;
};

const toUint32Bytes = (value: number): Uint8Array => {
  const normalized = Math.max(0, Math.floor(value));
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, normalized, false);
  return bytes;
};

const hmacSha256 = async (secret: string, data: string): Promise<Uint8Array> => {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return new Uint8Array(signature);
};

const sha256Hex = async (input: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
};

const buildLegacyUserStatusToken = async (
  userId: string,
  tokenVersion: number,
  secret: string
): Promise<string> => {
  const payload = `uid:${userId}:v:${tokenVersion}`;
  const payloadBase64 = encodeUtf8Base64Url(payload);
  const signature = await hmacSha256(secret, payloadBase64);
  const signatureBase64 = toBase64Url(signature);

  return `${payloadBase64}.${signatureBase64}`;
};

const buildCompactUserStatusToken = async (
  userId: string,
  tokenVersion: number,
  secret: string
): Promise<string | null> => {
  const userIdBytes = parseUuidToBytes(userId);
  if (!userIdBytes) {
    return null;
  }

  const payloadBytes = new Uint8Array(1 + userIdBytes.length + 4);
  payloadBytes[0] = COMPACT_USER_TOKEN_MARKER;
  payloadBytes.set(userIdBytes, 1);
  payloadBytes.set(toUint32Bytes(tokenVersion), 1 + userIdBytes.length);
  const payloadBase64 = toBase64Url(payloadBytes);
  const signature = await hmacSha256(secret, payloadBase64);
  const signatureBase64 = toBase64Url(
    signature.slice(0, COMPACT_USER_TOKEN_SIGNATURE_BYTES)
  );

  return `${payloadBase64}.${signatureBase64}`;
};

const buildUserStatusToken = async (
  userId: string,
  tokenVersion: number,
  secret: string
): Promise<string> => {
  const compactToken = await buildCompactUserStatusToken(userId, tokenVersion, secret);
  if (compactToken) {
    return compactToken;
  }
  return buildLegacyUserStatusToken(userId, tokenVersion, secret);
};

const resolveUserStatusToken = async (
  row: UserRow,
  tokenVersion: number,
  tokenSecret: string
): Promise<string> => {
  const compactToken = await buildCompactUserStatusToken(row.id, tokenVersion, tokenSecret);
  const preferredToken =
    compactToken ?? (await buildLegacyUserStatusToken(row.id, tokenVersion, tokenSecret));
  const tokenHash = row.access_token_hash?.trim();
  if (!tokenHash) {
    return preferredToken;
  }

  const preferredHash = await sha256Hex(preferredToken);
  if (preferredHash === tokenHash) {
    return preferredToken;
  }

  if (compactToken) {
    const legacyToken = await buildLegacyUserStatusToken(row.id, tokenVersion, tokenSecret);
    const legacyHash = await sha256Hex(legacyToken);
    if (legacyHash === tokenHash) {
      return legacyToken;
    }
  }

  return preferredToken;
};

const toAdminUserDTO = async (
  row: UserRow,
  tokenSecret: string
): Promise<AdminUserDTO> => {
  const tokenVersion = row.token_version ?? DEFAULT_USER_TOKEN_VERSION;
  const statusToken = await resolveUserStatusToken(row, tokenVersion, tokenSecret);

  return {
    id: row.id,
    username: row.username,
    systemEmail: row.system_email ?? null,
    familyGroupName: row.family_group_name ?? null,
    userEmail: row.user_email ?? null,
    systemInviteCode: row.system_invite_code ?? null,
    customInviteCode: row.custom_invite_code ?? null,
    expireAt: row.expire_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tokenVersion,
    statusToken
  };
};

const hasUsersTokenVersionColumn = async (db: D1Database): Promise<boolean> => {
  if (cachedHasUsersTokenVersionColumn !== null) {
    return cachedHasUsersTokenVersionColumn;
  }

  const rows = await db.prepare("PRAGMA table_info(users)").all<SqliteTableInfoRow>();
  const hasColumn = (rows.results || []).some((row) => row.name === "token_version");
  cachedHasUsersTokenVersionColumn = hasColumn;

  return hasColumn;
};

const hasUsersExtraProfileColumns = async (db: D1Database): Promise<boolean> => {
  if (cachedHasUsersExtraProfileColumns !== null) {
    return cachedHasUsersExtraProfileColumns;
  }

  const rows = await db.prepare("PRAGMA table_info(users)").all<SqliteTableInfoRow>();
  const columnNames = new Set((rows.results || []).map((row) => row.name));
  const hasColumns =
    columnNames.has("system_email") &&
    columnNames.has("family_group_name") &&
    columnNames.has("user_email");
  cachedHasUsersExtraProfileColumns = hasColumns;

  return hasColumns;
};

const hasUsersInviteCodeColumn = async (db: D1Database): Promise<boolean> => {
  if (cachedHasUsersInviteCodeColumn !== null) {
    return cachedHasUsersInviteCodeColumn;
  }

  const rows = await db.prepare("PRAGMA table_info(users)").all<SqliteTableInfoRow>();
  const hasColumn = (rows.results || []).some((row) => row.name === "system_invite_code");
  cachedHasUsersInviteCodeColumn = hasColumn;

  return hasColumn;
};

const hasInviteAliasesTable = async (db: D1Database): Promise<boolean> => {
  if (cachedHasInviteAliasesTable !== null) {
    return cachedHasInviteAliasesTable;
  }

  const row = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name = 'invite_aliases'
       LIMIT 1`
    )
    .first<SqliteTableInfoRow>();
  cachedHasInviteAliasesTable = Boolean(row?.name);

  return cachedHasInviteAliasesTable;
};

const hasRechargeTimelineColumns = async (db: D1Database): Promise<boolean> => {
  if (cachedHasRechargeTimelineColumns !== null) {
    return cachedHasRechargeTimelineColumns;
  }

  const rows = await db.prepare("PRAGMA table_info(recharge_records)").all<SqliteTableInfoRow>();
  const columnNames = new Set((rows.results || []).map((row) => row.name));
  const hasColumns =
    columnNames.has("occurred_at") &&
    columnNames.has("recorded_at") &&
    columnNames.has("source") &&
    columnNames.has("payment_amount_cents");
  cachedHasRechargeTimelineColumns = hasColumns;

  return hasColumns;
};

const hasRechargeExternalNoteColumn = async (db: D1Database): Promise<boolean> => {
  if (cachedHasRechargeExternalNoteColumn !== null) {
    return cachedHasRechargeExternalNoteColumn;
  }

  const rows = await db.prepare("PRAGMA table_info(recharge_records)").all<SqliteTableInfoRow>();
  const hasColumn = (rows.results || []).some((row) => row.name === "external_note");
  cachedHasRechargeExternalNoteColumn = hasColumn;

  return hasColumn;
};

const hasRechargeRefundColumns = async (db: D1Database): Promise<boolean> => {
  if (cachedHasRechargeRefundColumns !== null) {
    return cachedHasRechargeRefundColumns;
  }

  const rows = await db.prepare("PRAGMA table_info(recharge_records)").all<SqliteTableInfoRow>();
  const columnNames = new Set((rows.results || []).map((row) => row.name));
  const hasColumns =
    columnNames.has("refunded_at") &&
    columnNames.has("refund_note") &&
    columnNames.has("refunded_by_admin_id") &&
    columnNames.has("refund_amount_cents");
  cachedHasRechargeRefundColumns = hasColumns;

  return hasColumns;
};

const hasReferralTables = async (db: D1Database): Promise<boolean> => {
  if (cachedHasReferralTables !== null) {
    return cachedHasReferralTables;
  }

  const rows = await db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'user_referrals',
         'referral_reward_ledger',
         'referral_withdrawals',
         'referral_bonus_grants'
       )`
    )
    .all<SqliteTableInfoRow>();
  cachedHasReferralTables = (rows.results || []).length === 4;

  return cachedHasReferralTables;
};

const hasReferralDailyUnlockColumns = async (db: D1Database): Promise<boolean> => {
  if (cachedHasReferralDailyUnlockColumns !== null) {
    return cachedHasReferralDailyUnlockColumns;
  }

  const userRows = await db.prepare("PRAGMA table_info(users)").all<SqliteTableInfoRow>();
  const userColumns = new Set((userRows.results || []).map((row) => row.name));
  if (!userColumns.has("referral_reward_debt_cents")) {
    cachedHasReferralDailyUnlockColumns = false;
    return false;
  }

  const rewardRows = await db
    .prepare("PRAGMA table_info(referral_reward_ledger)")
    .all<SqliteTableInfoRow>();
  const rewardColumns = new Set((rewardRows.results || []).map((row) => row.name));
  const hasRewardColumns =
    rewardColumns.has("unlock_start_at") &&
    rewardColumns.has("total_days") &&
    rewardColumns.has("unlocked_days") &&
    rewardColumns.has("unlocked_amount_cents") &&
    rewardColumns.has("withdrawn_amount_cents") &&
    rewardColumns.has("fully_unlocked_at");
  if (!hasRewardColumns) {
    cachedHasReferralDailyUnlockColumns = false;
    return false;
  }

  const withdrawalRows = await db
    .prepare("PRAGMA table_info(referral_withdrawals)")
    .all<SqliteTableInfoRow>();
  const withdrawalColumns = new Set((withdrawalRows.results || []).map((row) => row.name));
  const hasWithdrawalColumns =
    withdrawalColumns.has("gross_amount_cents") &&
    withdrawalColumns.has("debt_offset_cents");
  cachedHasReferralDailyUnlockColumns = hasWithdrawalColumns;
  return hasWithdrawalColumns;
};

const normalizeInternalNote = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const normalizeOptionalText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const normalizeInviteCode = (value: unknown): string | null => {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return null;
  }

  return normalized;
};

const normalizeInviteAlias = (value: string): string => value.toLowerCase();

const isValidCustomInviteCode = (value: string): boolean =>
  value.length >= MIN_CUSTOM_INVITE_CODE_LENGTH &&
  value.length <= MAX_CUSTOM_INVITE_CODE_LENGTH &&
  INVITE_CODE_PATTERN.test(value);

const buildRandomSystemInviteCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(SYSTEM_INVITE_CODE_LENGTH));
  const chars = new Array<string>(SYSTEM_INVITE_CODE_LENGTH);
  for (let index = 0; index < SYSTEM_INVITE_CODE_LENGTH; index += 1) {
    const byte = bytes[index] as number;
    chars[index] = SYSTEM_INVITE_CODE_ALPHABET[byte % SYSTEM_INVITE_CODE_ALPHABET.length] as string;
  }
  return chars.join("");
};

const generateUniqueSystemInviteCode = async (db: D1Database): Promise<string> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = buildRandomSystemInviteCode();
    const existing = await db
      .prepare("SELECT id FROM users WHERE system_invite_code = ? LIMIT 1")
      .bind(candidate)
      .first<{ id: string }>();
    if (!existing) {
      return candidate;
    }
  }

  throw new Error("failed to generate unique system invite code");
};

const resolveInviterUserIdByCode = async (
  db: D1Database,
  inviteCode: string
): Promise<string | null> => {
  const normalizedInput = inviteCode.trim();
  if (!normalizedInput) {
    return null;
  }

  const hasAliasTable = await hasInviteAliasesTable(db);
  if (hasAliasTable) {
    const aliasMatch = await db
      .prepare(
        `SELECT user_id
         FROM invite_aliases
         WHERE alias_normalized = ? AND status = 'active'
         LIMIT 1`
      )
      .bind(normalizeInviteAlias(normalizedInput))
      .first<{ user_id: string }>();
    if (aliasMatch?.user_id) {
      return aliasMatch.user_id;
    }
  }

  const hasInviteCodeColumn = await hasUsersInviteCodeColumn(db);
  if (hasInviteCodeColumn) {
    const systemCodeMatch = await db
      .prepare(
        `SELECT id
         FROM users
         WHERE system_invite_code = ?
         LIMIT 1`
      )
      .bind(normalizedInput.toUpperCase())
      .first<InviteCodeResolvedUserRow>();
    if (systemCodeMatch?.id) {
      return systemCodeMatch.id;
    }
  }

  // Backward compatibility: allow binding by inviter user id.
  const inviterById = await db
    .prepare("SELECT id FROM users WHERE id = ? LIMIT 1")
    .bind(normalizedInput)
    .first<InviteCodeResolvedUserRow>();
  return inviterById?.id ?? null;
};

const toInviteCodeValidationMessage = (): string =>
  `customInviteCode must be ${MIN_CUSTOM_INVITE_CODE_LENGTH}-${MAX_CUSTOM_INVITE_CODE_LENGTH} chars and only include letters, numbers, _ or -`;

const upsertUserCustomInviteAlias = async (
  db: D1Database,
  params: {
    userId: string;
    customInviteCode: string;
    adminId: string;
    now: number;
  }
): Promise<{
  ok: true;
  customInviteCode: string;
} | {
  ok: false;
  status: 400 | 409;
  message: string;
}> => {
  const customInviteCode = params.customInviteCode.trim();
  if (!isValidCustomInviteCode(customInviteCode)) {
    return {
      ok: false,
      status: 400,
      message: toInviteCodeValidationMessage()
    };
  }

  const aliasNormalized = normalizeInviteAlias(customInviteCode);
  const existsByAlias = await db
    .prepare(
      `SELECT id, user_id, alias, alias_normalized, status
       FROM invite_aliases
       WHERE alias_normalized = ?
       LIMIT 1`
    )
    .bind(aliasNormalized)
    .first<InviteAliasRow>();
  if (existsByAlias && existsByAlias.user_id !== params.userId) {
    return {
      ok: false,
      status: 409,
      message: "custom invite code already in use"
    };
  }

  const disableCurrentStatement = db
    .prepare(
      `UPDATE invite_aliases
       SET status = 'disabled', updated_by_admin_id = ?, updated_at = ?
       WHERE user_id = ? AND status = 'active'`
    )
    .bind(params.adminId, params.now, params.userId);

  if (existsByAlias) {
    await db.batch([
      disableCurrentStatement,
      db
        .prepare(
          `UPDATE invite_aliases
           SET alias = ?, status = 'active', updated_by_admin_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(customInviteCode, params.adminId, params.now, existsByAlias.id)
    ]);
    return {
      ok: true,
      customInviteCode
    };
  }

  await db.batch([
    disableCurrentStatement,
    db
      .prepare(
        `INSERT INTO invite_aliases (
          id,
          user_id,
          alias,
          alias_normalized,
          status,
          created_by_admin_id,
          updated_by_admin_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        params.userId,
        customInviteCode,
        aliasNormalized,
        params.adminId,
        params.adminId,
        params.now,
        params.now
      )
  ]);
  return {
    ok: true,
    customInviteCode
  };
};

const normalizeProfileChangeNote = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const normalizeWithdrawNote = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const buildBackfillAuditInternalNote = (
  internalNote: string | null,
  grantReferralReward: boolean
): string => {
  const marker = grantReferralReward
    ? "[backfill_referral_reward=enabled]"
    : "[backfill_referral_reward=disabled]";
  if (!internalNote) {
    return marker;
  }
  if (internalNote.includes(marker)) {
    return internalNote;
  }

  return `${internalNote}\n${marker}`;
};

const normalizePaymentAmount = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(2));
};

const toPaymentAmountCents = (value: number): number => Math.round(value * 100);

const toPaymentAmount = (value: number | null | undefined): number => {
  const cents = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Number((Math.max(cents, 0) / 100).toFixed(2));
};

const toNonNegativeInt = (
  value: number | string | null | undefined
): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.floor(value), 0);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(Math.floor(parsed), 0);
    }
  }
  return 0;
};

const calculateRefundUsageSnapshot = (
  record: {
    change_days: number;
    payment_amount_cents: number | null;
    expire_before: number;
    expire_after: number;
  },
  now: number
): RefundUsageSnapshot => {
  const totalDays = toNonNegativeInt(record.change_days);
  if (totalDays <= 0) {
    return {
      usedDays: 0,
      refundableDays: 0,
      refundableAmountCents: 0
    };
  }

  const startAt = toNonNegativeInt(record.expire_before);
  const endAt = Math.max(toNonNegativeInt(record.expire_after), startAt);
  const elapsedSeconds = Math.max(Math.min(now, endAt) - startAt, 0);
  const usedDays = Math.min(totalDays, Math.floor(elapsedSeconds / SECONDS_PER_DAY));
  const refundableDays = Math.max(totalDays - usedDays, 0);
  const paymentAmountCents = toNonNegativeInt(record.payment_amount_cents);
  const refundableAmountCents = Math.floor(
    (paymentAmountCents * refundableDays) / totalDays
  );

  return {
    usedDays,
    refundableDays,
    refundableAmountCents
  };
};

const isUserProfileChangeField = (value: string): value is UserProfileChangeField => {
  return (
    value === UserProfileChangeField.SYSTEM_EMAIL ||
    value === UserProfileChangeField.FAMILY_GROUP_NAME ||
    value === UserProfileChangeField.USER_EMAIL
  );
};

const toUserProfileChangeField = (value: string): UserProfileChangeField =>
  isUserProfileChangeField(value)
    ? value
    : UserProfileChangeField.SYSTEM_EMAIL;

const isRechargeReason = (value: string): value is RechargeReason => {
  return (
    value === RechargeReason.WECHAT_PAY ||
    value === RechargeReason.ALIPAY ||
    value === RechargeReason.PLATFORM_ORDER ||
    value === RechargeReason.REFERRAL_REWARD ||
    value === RechargeReason.CAMPAIGN_GIFT ||
    value === RechargeReason.AFTER_SALES ||
    value === RechargeReason.MANUAL_FIX
  );
};

const toRechargeReason = (value: string): RechargeReason =>
  isRechargeReason(value) ? value : RechargeReason.MANUAL_FIX;

const toRechargeRecordSource = (value: string | null | undefined): RechargeRecordSource =>
  value === RechargeRecordSource.BACKFILL
    ? RechargeRecordSource.BACKFILL
    : value === RechargeRecordSource.SYSTEM_BONUS
      ? RechargeRecordSource.SYSTEM_BONUS
      : value === RechargeRecordSource.REFUND_ROLLBACK
        ? RechargeRecordSource.REFUND_ROLLBACK
        : RechargeRecordSource.NORMAL;

const toReferralRewardStatus = (value: string): ReferralRewardStatus => {
  if (value === ReferralRewardStatus.PENDING) {
    return ReferralRewardStatus.PENDING;
  }
  if (value === ReferralRewardStatus.AVAILABLE) {
    return ReferralRewardStatus.AVAILABLE;
  }
  if (value === ReferralRewardStatus.CANCELED) {
    return ReferralRewardStatus.CANCELED;
  }

  return ReferralRewardStatus.WITHDRAWN;
};

const toOccurredAt = (row: {
  occurred_at: number | null;
  created_at: number;
}): number => (row.occurred_at && row.occurred_at > 0 ? row.occurred_at : row.created_at);

const toRecordedAt = (row: {
  recorded_at: number | null;
  created_at: number;
}): number => (row.recorded_at && row.recorded_at > 0 ? row.recorded_at : row.created_at);

const toAdminRechargeRecordDTO = (row: RechargeRecordRow): AdminRechargeRecordDTO => ({
  id: row.id,
  userId: row.user_id,
  username: row.username,
  changeDays: row.change_days,
  reason: toRechargeReason(row.reason),
  paymentAmount: toPaymentAmount(row.payment_amount_cents),
  internalNote: row.internal_note,
  externalNote: row.external_note,
  expireBefore: row.expire_before,
  expireAfter: row.expire_after,
  operatorAdminId: row.operator_admin_id,
  operatorAdminUsername: row.operator_admin_username,
  occurredAt: toOccurredAt(row),
  recordedAt: toRecordedAt(row),
  source: toRechargeRecordSource(row.source),
  refundedAt: row.refunded_at ?? null,
  refundedByAdminId: row.refunded_by_admin_id ?? null,
  refundAmount: toPaymentAmount(row.refund_amount_cents),
  refundNote: row.refund_note ?? null,
  createdAt: row.created_at
});

const toAdminReferralRewardRecordDTO = (
  row: ReferralRewardLedgerRow
): AdminReferralRewardRecordDTO => {
  const rewardAmountCents = toNonNegativeInt(row.reward_amount_cents);
  const unlockedAmountCents = Math.min(
    rewardAmountCents,
    toNonNegativeInt(row.unlocked_amount_cents)
  );
  const withdrawnAmountCents = toNonNegativeInt(row.withdrawn_amount_cents);
  const withdrawableAmountCents = Math.max(unlockedAmountCents - withdrawnAmountCents, 0);

  return {
    id: row.id,
    inviterUserId: row.inviter_user_id,
    inviterUsername: row.inviter_username,
    inviteeUserId: row.invitee_user_id,
    inviteeUsername: row.invitee_username,
    rechargeRecordId: row.recharge_record_id,
    rechargeReason: toRechargeReason(row.recharge_reason),
    rechargeSource: toRechargeRecordSource(row.recharge_source),
    paymentAmount: toPaymentAmount(row.payment_amount_cents),
    rewardRateBps: row.reward_rate_bps,
    rewardAmount: toPaymentAmount(rewardAmountCents),
    unlockedRewardAmount: toPaymentAmount(unlockedAmountCents),
    withdrawableRewardAmount: toPaymentAmount(withdrawableAmountCents),
    withdrawnRewardAmount: toPaymentAmount(withdrawnAmountCents),
    totalDays: toNonNegativeInt(row.total_days),
    unlockedDays: toNonNegativeInt(row.unlocked_days),
    status: toReferralRewardStatus(row.status),
    unlockAt: row.unlock_at,
    availableAt: row.available_at ?? null,
    canceledAt: row.canceled_at ?? null,
    canceledReason: row.canceled_reason ?? null,
    withdrawnAt: row.withdrawn_at ?? null,
    withdrawalId: row.withdrawal_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
};

const toAdminReferralWithdrawalDTO = (
  row: ReferralWithdrawalRow
): AdminReferralWithdrawalDTO => ({
  id: row.id,
  inviterUserId: row.inviter_user_id,
  inviterUsername: row.inviter_username,
  amount: toPaymentAmount(row.amount_cents),
  grossAmount: toPaymentAmount(row.gross_amount_cents),
  debtOffsetAmount: toPaymentAmount(row.debt_offset_cents),
  processedByAdminId: row.processed_by_admin_id,
  processedByAdminUsername: row.processed_by_admin_username,
  note: row.note,
  createdAt: row.created_at
});

const toAdminUserProfileChangeRecordDTO = (
  row: UserProfileChangeLogRow
): AdminUserProfileChangeRecordDTO => ({
  id: row.id,
  changeBatchId: row.change_batch_id,
  userId: row.user_id,
  username: row.username,
  field: toUserProfileChangeField(row.field_name),
  beforeValue: row.before_value,
  afterValue: row.after_value,
  changeNote: row.change_note,
  operatorAdminId: row.operator_admin_id,
  operatorAdminUsername: row.operator_admin_username,
  createdAt: row.created_at
});

const toUserStatusHistoryRecordDTO = (
  row: UserStatusHistoryRow
): UserStatusHistoryRecordDTO => ({
  id: row.id,
  changeDays: row.change_days,
  reason: toRechargeReason(row.reason),
  paymentAmount: toPaymentAmount(row.payment_amount_cents),
  externalNote: row.external_note,
  expireBefore: row.expire_before,
  expireAfter: row.expire_after,
  createdAt: row.occurred_at && row.occurred_at > 0 ? row.occurred_at : row.created_at
});

const toUtc8DayRange = (
  timestamp: number
): {
  dayStartAt: number;
  dayEndAt: number;
} => {
  const shifted = timestamp + UTC8_OFFSET_SECONDS;
  const dayStartAt = Math.floor(shifted / SECONDS_PER_DAY) * SECONDS_PER_DAY - UTC8_OFFSET_SECONDS;
  return {
    dayStartAt,
    dayEndAt: dayStartAt + SECONDS_PER_DAY
  };
};

const requireRechargeTimelineColumns = async (
  c: AppContext
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const hasColumns = await hasRechargeTimelineColumns(c.env.DB);
  if (!hasColumns) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: recharge record columns missing")
    };
  }

  return { ok: true };
};

const requireRechargeExternalNoteColumn = async (
  c: AppContext
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const hasColumn = await hasRechargeExternalNoteColumn(c.env.DB);
  if (!hasColumn) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: recharge_records.external_note column missing")
    };
  }

  return { ok: true };
};

const requireRechargeRefundColumns = async (
  c: AppContext
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const hasColumns = await hasRechargeRefundColumns(c.env.DB);
  if (!hasColumns) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: recharge refund columns missing")
    };
  }

  return { ok: true };
};

const requireReferralTables = async (
  c: AppContext
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const hasTables = await hasReferralTables(c.env.DB);
  if (!hasTables) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: referral tables missing")
    };
  }

  const hasDailyUnlockColumns = await hasReferralDailyUnlockColumns(c.env.DB);
  if (!hasDailyUnlockColumns) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: referral daily unlock columns missing")
    };
  }

  return { ok: true };
};

const requireInviteCodeSupport = async (
  c: AppContext
): Promise<{ ok: true } | { ok: false; response: Response }> => {
  const hasInviteCodeColumn = await hasUsersInviteCodeColumn(c.env.DB);
  if (!hasInviteCodeColumn) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: users.system_invite_code column missing")
    };
  }

  const hasAliasTable = await hasInviteAliasesTable(c.env.DB);
  if (!hasAliasTable) {
    return {
      ok: false,
      response: fail(c, 500, "database migration required: invite_aliases table missing")
    };
  }

  return { ok: true };
};

const rebuildUserRechargeChain = async (
  db: D1Database,
  userId: string,
  updatedAt: number
): Promise<number> => {
  const rows = await db.prepare(
    `SELECT
      id,
      change_days,
      COALESCE(occurred_at, created_at) AS occurred_at,
      expire_before,
      expire_after
    FROM recharge_records
    WHERE user_id = ?
    ORDER BY COALESCE(occurred_at, created_at) ASC, id ASC`
  )
    .bind(userId)
    .all<RechargeRebuildRow>();

  const statements: D1PreparedStatement[] = [];
  const firstRow = rows.results?.[0];
  let runningExpireAt = firstRow ? Math.max(firstRow.expire_before, 0) : 0;

  for (const row of rows.results || []) {
    const expireBefore = runningExpireAt;
    const expireAfter = Math.max(expireBefore, row.occurred_at) + row.change_days * SECONDS_PER_DAY;
    runningExpireAt = expireAfter;

    if (row.expire_before !== expireBefore || row.expire_after !== expireAfter) {
      statements.push(
        db.prepare("UPDATE recharge_records SET expire_before = ?, expire_after = ? WHERE id = ?")
          .bind(expireBefore, expireAfter, row.id)
      );
    }
  }

  statements.push(
    db.prepare("UPDATE users SET expire_at = ?, updated_at = ? WHERE id = ?")
      .bind(runningExpireAt, updatedAt, userId)
  );

  await db.batch(statements);
  return runningExpireAt;
};

const createAndRebuildRechargeRecord = async (
  c: AppContext,
  params: {
    userId: string;
    days: number;
    reason: RechargeReason;
    paymentAmountCents: number;
    internalNote: string | null;
    externalNote: string | null;
    occurredAt: number;
    source: RechargeRecordSource;
  }
): Promise<AdminRechargeUserResponseDTO | null> => {
  const session = c.get("adminSession");
  const now = getCurrentTimestamp();

  const user = await c.env.DB.prepare(
    "SELECT id, username, expire_at, updated_at FROM users WHERE id = ? LIMIT 1"
  )
    .bind(params.userId)
    .first<RechargeTargetUserRow>();
  if (!user) {
    return null;
  }

  const recordId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO recharge_records (
      id,
      user_id,
      change_days,
      reason,
      payment_amount_cents,
      internal_note,
      external_note,
      expire_before,
      expire_after,
      operator_admin_id,
      created_at,
      occurred_at,
      recorded_at,
      source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`
  )
    .bind(
      recordId,
      params.userId,
      params.days,
      params.reason,
      params.paymentAmountCents,
      params.internalNote,
      params.externalNote,
      session.adminId,
      now,
      params.occurredAt,
      now,
      params.source
    )
    .run();

  const finalExpireAt = await rebuildUserRechargeChain(c.env.DB, params.userId, now);
  const insertedRow = await c.env.DB.prepare(
    `SELECT
      r.id,
      r.user_id,
      u.username AS username,
      r.change_days,
      r.reason,
      r.payment_amount_cents,
      r.internal_note,
      r.external_note,
      r.expire_before,
      r.expire_after,
      r.operator_admin_id,
      a.username AS operator_admin_username,
      r.occurred_at,
      r.recorded_at,
      r.source,
      r.refunded_at,
      r.refunded_by_admin_id,
      r.refund_amount_cents,
      r.refund_note,
      r.created_at
    FROM recharge_records AS r
    INNER JOIN users AS u ON u.id = r.user_id
    INNER JOIN admin_users AS a ON a.id = r.operator_admin_id
    WHERE r.id = ?
    LIMIT 1`
  )
    .bind(recordId)
    .first<RechargeRecordRow>();
  if (!insertedRow) {
    throw new Error("inserted recharge record not found");
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      expireAt: finalExpireAt,
      updatedAt: now
    },
    record: toAdminRechargeRecordDTO(insertedRow)
  };
};

const getRechargeRecordById = async (
  db: D1Database,
  recordId: string
): Promise<RechargeRecordRow | null> =>
  db
    .prepare(
      `SELECT
        r.id,
        r.user_id,
        u.username AS username,
        r.change_days,
        r.reason,
        r.payment_amount_cents,
        r.internal_note,
        r.external_note,
        r.expire_before,
        r.expire_after,
        r.operator_admin_id,
        a.username AS operator_admin_username,
        r.occurred_at,
        r.recorded_at,
        r.source,
        r.refunded_at,
        r.refunded_by_admin_id,
        r.refund_amount_cents,
        r.refund_note,
        r.created_at
       FROM recharge_records AS r
       INNER JOIN users AS u ON u.id = r.user_id
       INNER JOIN admin_users AS a ON a.id = r.operator_admin_id
       WHERE r.id = ?
       LIMIT 1`
    )
    .bind(recordId)
    .first<RechargeRecordRow>();

const applyReferralEffectsForRecharge = async (
  c: AppContext,
  params: {
    userId: string;
    recharge: AdminRechargeUserResponseDTO;
    occurredAt: number;
    allowBackfillReward?: boolean;
  }
): Promise<void> => {
  const isBackfillRecharge = params.recharge.record.source === RechargeRecordSource.BACKFILL;
  const useRetroactiveBackfillUnlock =
    isBackfillRecharge && params.allowBackfillReward === true;
  const unlockStartAt = useRetroactiveBackfillUnlock
    ? params.recharge.record.occurredAt
    : params.recharge.record.expireBefore;

  const rewardResult = await createReferralRewardForRecharge(c.env.DB, {
    inviteeUserId: params.userId,
    rechargeRecordId: params.recharge.record.id,
    rechargeReason: params.recharge.record.reason,
    rechargeSource: params.recharge.record.source,
    paymentAmountCents: toPaymentAmountCents(params.recharge.record.paymentAmount),
    totalDays: Math.max(params.recharge.record.changeDays, 1),
    unlockStartAt,
    allowBackfillReward: params.allowBackfillReward,
    now: params.occurredAt
  });

  if (!rewardResult.created) {
    return;
  }

  if (useRetroactiveBackfillUnlock) {
    await unlockPendingReferralRewards(c.env.DB, params.occurredAt);
  }

  const reservedBonus = await reserveInviteeBonusGrant(c.env.DB, {
    inviteeUserId: params.userId,
    triggerRechargeRecordId: params.recharge.record.id,
    bonusDays: REFERRAL_BONUS_DAYS,
    now: params.occurredAt
  });
  if (!reservedBonus) {
    return;
  }

  const bonusRecharge = await createAndRebuildRechargeRecord(c, {
    userId: params.userId,
    days: REFERRAL_BONUS_DAYS,
    reason: RechargeReason.REFERRAL_REWARD,
    paymentAmountCents: 0,
    internalNote: "invitee first paid recharge bonus",
    externalNote: "邀请奖励：首单赠送 30 天会员",
    occurredAt: params.occurredAt,
    source: RechargeRecordSource.SYSTEM_BONUS
  });
  if (!bonusRecharge) {
    return;
  }

  await confirmInviteeBonusGrant(c.env.DB, {
    inviteeUserId: params.userId,
    bonusRechargeRecordId: bonusRecharge.record.id
  });
};

const buildApiResponse = <T>(
  c: AppContext,
  status: HttpStatus,
  code: number,
  message: string,
  data: T
) => {
  const payload: ApiResponse<T> = {
    code,
    message,
    data,
    requestId: c.get("requestId")
  };

  return c.json(payload, status);
};

const ok = <T>(
  c: AppContext,
  data: T,
  message = "ok"
) => buildApiResponse(c, 200, 0, message, data);

const fail = (
  c: AppContext,
  status: Exclude<HttpStatus, 200>,
  message: string
) => buildApiResponse(c, status, status, message, null);

app.use("*", async (c, next) => {
  c.set("requestId", createRequestId(c.req.raw));
  await next();
});

app.use("/api/admin/*", async (c, next) => {
  if (c.req.path === "/api/admin/login") {
    await next();
    return;
  }

  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) {
    return fail(c, 401, "unauthorized");
  }

  const jwtSecret = getJwtSecret(c.env);
  if (!jwtSecret) {
    return fail(c, 500, "JWT secret is not configured");
  }

  try {
    const payload = await verify(token, jwtSecret, "HS256");
    const adminId = typeof payload.sub === "string" ? payload.sub : "";
    const username = typeof payload.username === "string" ? payload.username : "";
    const expiresAt = typeof payload.exp === "number" ? payload.exp : 0;

    if (!adminId || !username || expiresAt <= getCurrentTimestamp()) {
      throw new Error("session expired");
    }

    c.set("adminSession", { adminId, username, expiresAt });
    await next();
  } catch {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/" });
    return fail(c, 401, "unauthorized");
  }
});

app.get("/api/health", (c) => {
  return ok<HealthDTO>(
    c,
    {
      status: "ok",
      timestamp: getCurrentTimestamp(),
      environment: c.env.APP_ENV ?? "unknown"
    },
    "ok"
  );
});

app.get("/api/status/:token", async (c) => {
  const token = c.req.param("token")?.trim();
  if (!token) {
    return fail(c, 400, "token is required");
  }

  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  const profileSelect = hasUsersProfileColumns
    ? "user_email"
    : "NULL AS user_email";
  const tokenHash = await sha256Hex(token);
  const user = await c.env.DB.prepare(
    `SELECT id, username, ${profileSelect}, expire_at
     FROM users
     WHERE access_token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first<UserStatusRow>();

  if (!user) {
    return fail(c, 404, "user not found");
  }

  const totalChangeDaysRow = await c.env.DB.prepare(
    `SELECT
      COALESCE(SUM(change_days), 0) AS total_change_days
     FROM recharge_records
     WHERE user_id = ?`
  )
    .bind(user.id)
    .first<UserTotalChangeDaysRow>();

  const hasRechargeTimeline = await hasRechargeTimelineColumns(c.env.DB);
  const hasRechargeExternalNote = await hasRechargeExternalNoteColumn(c.env.DB);
  const externalNoteSelect = hasRechargeExternalNote
    ? "external_note"
    : "NULL AS external_note";
  const historyRows = hasRechargeTimeline
    ? await c.env.DB.prepare(
      `SELECT
        id,
        change_days,
        reason,
        payment_amount_cents,
        ${externalNoteSelect},
        expire_before,
        expire_after,
        occurred_at,
        created_at
       FROM recharge_records
       WHERE user_id = ?
       ORDER BY COALESCE(occurred_at, created_at) DESC, id DESC
       LIMIT ?`
    )
      .bind(user.id, DEFAULT_STATUS_HISTORY_LIMIT)
      .all<UserStatusHistoryRow>()
    : await c.env.DB.prepare(
      `SELECT
        id,
        change_days,
        reason,
        0 AS payment_amount_cents,
        NULL AS external_note,
        expire_before,
        expire_after,
        NULL AS occurred_at,
        created_at
       FROM recharge_records
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
      .bind(user.id, DEFAULT_STATUS_HISTORY_LIMIT)
      .all<UserStatusHistoryRow>();

  const now = getCurrentTimestamp();
  const referralEnabled =
    (await hasReferralTables(c.env.DB)) &&
    (await hasReferralDailyUnlockColumns(c.env.DB));
  if (referralEnabled) {
    await unlockPendingReferralRewards(c.env.DB, now);
  }
  const inviteeCountRow = referralEnabled
    ? await c.env.DB.prepare(
      `SELECT COUNT(*) AS invitee_count
       FROM user_referrals
       WHERE inviter_user_id = ?`
    )
      .bind(user.id)
      .first<UserInviteeCountRow>()
    : null;
  const referralSummaryRow = referralEnabled
    ? await c.env.DB.prepare(
      `SELECT
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
        ), 0) AS gross_available_amount_cents,
        COALESCE(SUM(CASE WHEN withdrawn_amount_cents > 0 THEN withdrawn_amount_cents ELSE 0 END), 0) AS withdrawn_amount_cents,
        COALESCE(
          (
            SELECT referral_reward_debt_cents
            FROM users
            WHERE id = ?
            LIMIT 1
          ),
          0
        ) AS reward_debt_cents
       FROM referral_reward_ledger
       WHERE inviter_user_id = ?`
    )
      .bind(user.id, user.id)
      .first<UserReferralSummaryRow>()
    : null;
  const inviteeRewardRows = referralEnabled
    ? await c.env.DB.prepare(
      `SELECT
        l.invitee_user_id,
        u.username AS invitee_username,
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
        ), 0) AS available_amount_cents,
        COALESCE(SUM(CASE WHEN l.withdrawn_amount_cents > 0 THEN l.withdrawn_amount_cents ELSE 0 END), 0) AS withdrawn_amount_cents,
        COALESCE(SUM(CASE WHEN l.status != '${ReferralRewardStatus.CANCELED}' AND l.reward_amount_cents > 0 THEN l.reward_amount_cents ELSE 0 END), 0) AS reward_amount_cents
       FROM referral_reward_ledger AS l
       INNER JOIN users AS u ON u.id = l.invitee_user_id
       WHERE l.inviter_user_id = ?
       GROUP BY l.invitee_user_id, u.username
       ORDER BY reward_amount_cents DESC, l.invitee_user_id ASC
       LIMIT 50`
    )
      .bind(user.id)
      .all<UserInviteeRewardSummaryRow>()
    : { results: [] };

  const remainingDays =
    user.expire_at > now
      ? Math.ceil((user.expire_at - now) / SECONDS_PER_DAY)
      : 0;
  const totalChangeDays = Number(totalChangeDaysRow?.total_change_days || 0);
  const usedDays = Math.max(totalChangeDays - remainingDays, 0);
  const pendingRewardAmountCents = toNonNegativeInt(referralSummaryRow?.pending_amount_cents);
  const grossAvailableAmountCents = toNonNegativeInt(
    referralSummaryRow?.gross_available_amount_cents
  );
  const withdrawnRewardAmountCents = toNonNegativeInt(
    referralSummaryRow?.withdrawn_amount_cents
  );
  const rewardDebtCents = toNonNegativeInt(referralSummaryRow?.reward_debt_cents);
  const netWithdrawableAmountCents = Math.max(
    grossAvailableAmountCents - rewardDebtCents,
    0
  );
  const payload: UserStatusResponseDTO = {
    user: {
      id: user.id,
      username: user.username,
      expireAt: user.expire_at,
      status:
        user.expire_at > now
          ? MembershipStatus.ACTIVE
          : MembershipStatus.EXPIRED,
      remainingDays,
      usedDays,
      userEmail: user.user_email ?? null
    },
    history: (historyRows.results || []).map((row) =>
      toUserStatusHistoryRecordDTO(row)
    ),
    referral: {
      inviteeCount: Number(inviteeCountRow?.invitee_count || 0),
      pendingRewardAmount: toPaymentAmount(pendingRewardAmountCents),
      availableRewardAmount: toPaymentAmount(netWithdrawableAmountCents),
      withdrawnRewardAmount: toPaymentAmount(withdrawnRewardAmountCents),
      totalRewardAmount: toPaymentAmount(
        pendingRewardAmountCents + grossAvailableAmountCents + withdrawnRewardAmountCents
      ),
      rewardDebtAmount: toPaymentAmount(rewardDebtCents),
      netWithdrawableAmount: toPaymentAmount(netWithdrawableAmountCents),
      invitees: (inviteeRewardRows.results || []).map((row) => ({
        inviteeUserId: row.invitee_user_id,
        inviteeUsername: row.invitee_username,
        pendingRewardAmount: toPaymentAmount(toNonNegativeInt(row.pending_amount_cents)),
        availableRewardAmount: toPaymentAmount(toNonNegativeInt(row.available_amount_cents)),
        withdrawnRewardAmount: toPaymentAmount(toNonNegativeInt(row.withdrawn_amount_cents)),
        totalRewardAmount: toPaymentAmount(toNonNegativeInt(row.reward_amount_cents))
      }))
    },
    now
  };

  return ok(c, payload);
});

app.post("/api/admin/login", async (c) => {
  const jwtSecret = getJwtSecret(c.env);
  if (!jwtSecret) {
    return fail(c, 500, "JWT secret is not configured");
  }

  const clientIp = getClientIp(c.req.raw);
  const now = getCurrentTimestamp();
  const limitStatus = checkLoginLimit(clientIp, now);
  if (limitStatus.blocked) {
    c.header("Retry-After", String(limitStatus.retryAfterSeconds));
    return fail(c, 429, "too many failed login attempts, please retry later");
  }

  const body = await c.req.json<Partial<AdminLoginRequestDTO>>().catch(() => null);
  const username = body?.username?.trim();
  const password = body?.password;

  if (!username || !password) {
    return fail(c, 400, "username and password are required");
  }

  const admin = await c.env.DB.prepare(
    "SELECT id, username, password_hash FROM admin_users WHERE username = ? LIMIT 1"
  )
    .bind(username)
    .first<AdminUserRow>();

  if (!admin || !(await verifyPasswordHash(password, admin.password_hash))) {
    const failedStatus = recordFailedLogin(clientIp, now);
    if (failedStatus.blocked) {
      c.header("Retry-After", String(failedStatus.retryAfterSeconds));
      return fail(c, 429, "too many failed login attempts, please retry later");
    }
    return fail(c, 401, "invalid username or password");
  }

  clearLoginLimit(clientIp);

  const sessionTtlSeconds = parseSessionTtlSeconds(c.env.ADMIN_SESSION_TTL_SECONDS);
  const expiresAt = now + sessionTtlSeconds;
  const token = await sign(
    {
      sub: admin.id,
      username: admin.username,
      iat: now,
      exp: expiresAt
    },
    jwtSecret,
    "HS256"
  );

  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(c.req.raw, c.env),
    sameSite: "Lax",
    path: "/",
    maxAge: sessionTtlSeconds
  });

  await c.env.DB.prepare("UPDATE admin_users SET last_login_at = unixepoch() WHERE id = ?")
    .bind(admin.id)
    .run();

  return ok<AdminLoginResponseDTO>(c, {
    adminId: admin.id,
    username: admin.username,
    expiresAt
  });
});

app.get("/api/admin/session", (c) => {
  const session = c.get("adminSession");
  const payload: AdminSessionDTO = {
    adminId: session.adminId,
    username: session.username,
    expiresAt: session.expiresAt
  };

  return ok(c, payload);
});

app.post("/api/admin/users", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const body = await c.req.json<Partial<AdminCreateUserRequestDTO>>().catch(() => null);
  const username = body?.username?.trim();
  if (!username) {
    return fail(c, 400, "username is required");
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return fail(c, 400, `username must be <= ${MAX_USERNAME_LENGTH} chars`);
  }
  const systemEmail = normalizeOptionalText(body?.systemEmail)?.toLowerCase();
  const familyGroupName = normalizeOptionalText(body?.familyGroupName);
  const userEmail = normalizeOptionalText(body?.userEmail)?.toLowerCase();
  const inviterCode = normalizeInviteCode(body?.inviterCode);
  const inviterUserIdInput = normalizeInviteCode(body?.inviterUserId);
  const inviterLookupInput = inviterCode ?? inviterUserIdInput;
  if (familyGroupName && familyGroupName.length > MAX_FAMILY_GROUP_NAME_LENGTH) {
    return fail(c, 400, `familyGroupName must be <= ${MAX_FAMILY_GROUP_NAME_LENGTH} chars`);
  }
  if (systemEmail && systemEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `systemEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (userEmail && userEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `userEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (systemEmail && !EMAIL_PATTERN.test(systemEmail)) {
    return fail(c, 400, "systemEmail must be a valid email");
  }
  if (userEmail && !EMAIL_PATTERN.test(userEmail)) {
    return fail(c, 400, "userEmail must be a valid email");
  }
  if (inviterLookupInput) {
    const referralCheck = await requireReferralTables(c);
    if (!referralCheck.ok) {
      return referralCheck.response;
    }
  }

  const userId = crypto.randomUUID();
  const tokenVersion = DEFAULT_USER_TOKEN_VERSION;
  const statusToken = await buildUserStatusToken(userId, tokenVersion, tokenSecret);
  const tokenHash = await sha256Hex(statusToken);
  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  const hasInviteCodeColumn = await hasUsersInviteCodeColumn(c.env.DB);
  let systemInviteCode = hasInviteCodeColumn
    ? await generateUniqueSystemInviteCode(c.env.DB)
    : null;
  let resolvedInviterUserId: string | null = null;
  if (inviterLookupInput) {
    resolvedInviterUserId = await resolveInviterUserIdByCode(c.env.DB, inviterLookupInput);
    if (!resolvedInviterUserId) {
      return fail(c, 400, "inviter not found by invite code");
    }
  }

  if (!hasUsersProfileColumns && (systemEmail || familyGroupName || userEmail)) {
    return fail(c, 500, "database migration required: users profile columns missing");
  }

  const baseInsertColumns = ["id", "username", "access_token_hash", "expire_at"];
  const baseInsertValues: Array<string | number | null> = [
    userId,
    username,
    tokenHash,
    0
  ];
  if (hasUsersProfileColumns) {
    baseInsertColumns.push("system_email", "family_group_name", "user_email");
    baseInsertValues.push(systemEmail ?? null, familyGroupName ?? null, userEmail ?? null);
  }
  if (hasTokenVersionColumn) {
    baseInsertColumns.push("token_version");
    baseInsertValues.push(tokenVersion);
  }

  let insertError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const insertColumns = [...baseInsertColumns];
    const insertValues = [...baseInsertValues];
    if (hasInviteCodeColumn) {
      insertColumns.push("system_invite_code");
      insertValues.push(systemInviteCode);
    }

    try {
      await c.env.DB
        .prepare(
          `INSERT INTO users (${insertColumns.join(", ")})
           VALUES (${insertColumns.map(() => "?").join(", ")})`
        )
        .bind(...insertValues)
        .run();
      insertError = null;
      break;
    } catch (error) {
      insertError = error;
      const message = error instanceof Error ? error.message : "";
      if (
        hasInviteCodeColumn &&
        message.includes("UNIQUE constraint failed: users.system_invite_code")
      ) {
        systemInviteCode = await generateUniqueSystemInviteCode(c.env.DB);
        continue;
      }
      break;
    }
  }
  if (insertError) {
    console.error("create user insert failed", insertError);
    return fail(c, 500, "failed to create user");
  }

  const now = getCurrentTimestamp();
  if (resolvedInviterUserId) {
    const bindResult = await bindUserReferral(c.env.DB, {
      inviterUserId: resolvedInviterUserId,
      inviteeUserId: userId,
      boundByAdminId: c.get("adminSession").adminId,
      now,
      checkProfileAbuse: hasUsersProfileColumns
    });
    if (!bindResult.ok) {
      await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
      return fail(c, 400, bindResult.message);
    }
  }

  const payload: AdminCreateUserResponseDTO = {
    user: {
      id: userId,
      username,
      systemEmail: hasUsersProfileColumns ? systemEmail ?? null : null,
      familyGroupName: hasUsersProfileColumns ? familyGroupName ?? null : null,
      userEmail: hasUsersProfileColumns ? userEmail ?? null : null,
      systemInviteCode,
      customInviteCode: null,
      expireAt: 0,
      createdAt: now,
      updatedAt: now,
      tokenVersion,
      statusToken,
      inviterUserId: resolvedInviterUserId
    }
  };

  return ok(c, payload);
});

app.get("/api/admin/users", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const query = c.req.query("query")?.trim() || "";
  const escapedQuery = query.replaceAll("%", "\\%").replaceAll("_", "\\_");
  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  const hasInviteCodeColumn = await hasUsersInviteCodeColumn(c.env.DB);
  const hasAliasTable = await hasInviteAliasesTable(c.env.DB);
  const tokenVersionSelect = hasTokenVersionColumn
    ? "token_version"
    : `${DEFAULT_USER_TOKEN_VERSION} AS token_version`;
  const profileSelect = hasUsersProfileColumns
    ? "system_email, family_group_name, user_email"
    : "NULL AS system_email, NULL AS family_group_name, NULL AS user_email";
  const systemInviteCodeSelect = hasInviteCodeColumn
    ? "u.system_invite_code"
    : "NULL AS system_invite_code";
  const customInviteCodeSelect = hasAliasTable
    ? `(SELECT ia.alias
        FROM invite_aliases AS ia
        WHERE ia.user_id = u.id AND ia.status = 'active'
        ORDER BY ia.updated_at DESC, ia.id DESC
        LIMIT 1) AS custom_invite_code`
    : "NULL AS custom_invite_code";

  const rows = query
    ? await (async () => {
      const whereClauses = [
        "u.username LIKE ? ESCAPE '\\'",
        "u.id LIKE ? ESCAPE '\\'"
      ];
      const whereValues = [`%${escapedQuery}%`, `%${escapedQuery}%`];
      if (hasInviteCodeColumn) {
        whereClauses.push("u.system_invite_code LIKE ? ESCAPE '\\'");
        whereValues.push(`%${escapedQuery}%`);
      }
      if (hasAliasTable) {
        whereClauses.push(
          `EXISTS (
            SELECT 1
            FROM invite_aliases AS ia
            WHERE ia.user_id = u.id AND ia.status = 'active' AND ia.alias LIKE ? ESCAPE '\\'
          )`
        );
        whereValues.push(`%${escapedQuery}%`);
      }

      return c.env.DB.prepare(
        `SELECT
          u.id,
          u.username,
          ${profileSelect},
          ${systemInviteCodeSelect},
          ${customInviteCodeSelect},
          u.expire_at,
          u.created_at,
          u.updated_at,
          ${tokenVersionSelect},
          u.access_token_hash
         FROM users AS u
         WHERE ${whereClauses.join(" OR ")}
         ORDER BY u.created_at DESC
         LIMIT ?`
      )
        .bind(...whereValues, USER_LIST_LIMIT)
        .all<UserRow>();
    })()
    : await c.env.DB.prepare(
      `SELECT
        u.id,
        u.username,
        ${profileSelect},
        ${systemInviteCodeSelect},
        ${customInviteCodeSelect},
        u.expire_at,
        u.created_at,
        u.updated_at,
        ${tokenVersionSelect},
        u.access_token_hash
       FROM users AS u
       ORDER BY u.created_at DESC
       LIMIT ?`
    )
      .bind(USER_LIST_LIMIT)
      .all<UserRow>();

  let users = await Promise.all((rows.results || []).map((row) => toAdminUserDTO(row, tokenSecret)));
  const hasReferralBase = await hasReferralTables(c.env.DB);
  const hasReferral = hasReferralBase
    ? await hasReferralDailyUnlockColumns(c.env.DB)
    : false;
  if (hasReferral && users.length > 0) {
    await unlockPendingReferralRewards(c.env.DB, getCurrentTimestamp());
    const userIds = users.map((user) => user.id);
    const placeholders = userIds.map(() => "?").join(", ");
    const referralRows = await c.env.DB
      .prepare(
        `SELECT
          r.invitee_user_id,
          r.inviter_user_id,
          i.username AS inviter_username
         FROM user_referrals AS r
         INNER JOIN users AS i ON i.id = r.inviter_user_id
         WHERE r.invitee_user_id IN (${placeholders})`
      )
      .bind(...userIds)
      .all<UserReferralRow>();
    const inviteeToInviter = new Map(
      (referralRows.results || []).map((row) => [row.invitee_user_id, row])
    );
    const inviteeCountMap = await countInviteesByInviter(c.env.DB, userIds);
    const rewardSummaryMap = await summarizeReferralRewardsByInviter(c.env.DB, userIds);

    users = users.map((user) => {
      const inviter = inviteeToInviter.get(user.id);
      const rewardSummary = rewardSummaryMap.get(user.id);

      return {
        ...user,
        inviterUserId: inviter?.inviter_user_id ?? null,
        inviterUsername: inviter?.inviter_username ?? null,
        inviteeCount: inviteeCountMap.get(user.id) ?? 0,
        pendingRewardAmount: toPaymentAmount(rewardSummary?.pendingAmountCents || 0),
        availableRewardAmount: toPaymentAmount(rewardSummary?.availableAmountCents || 0),
        rewardDebtAmount: toPaymentAmount(rewardSummary?.rewardDebtCents || 0),
        grossAvailableRewardAmount: toPaymentAmount(
          rewardSummary?.grossAvailableAmountCents || 0
        ),
        netWithdrawableAmount: toPaymentAmount(rewardSummary?.availableAmountCents || 0)
      };
    });
  }

  const payload: AdminListUsersResponseDTO = {
    items: users,
    query
  };

  return ok(c, payload);
});

app.patch("/api/admin/users/:id", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  if (!hasUsersProfileColumns) {
    return fail(c, 500, "database migration required: users profile columns missing");
  }

  const body = await c.req.json<Partial<AdminUpdateUserRequestDTO>>().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (!username) {
    return fail(c, 400, "username is required");
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return fail(c, 400, `username must be <= ${MAX_USERNAME_LENGTH} chars`);
  }

  const systemEmail = normalizeOptionalText(body?.systemEmail)?.toLowerCase() ?? null;
  const familyGroupName = normalizeOptionalText(body?.familyGroupName);
  const userEmail = normalizeOptionalText(body?.userEmail)?.toLowerCase() ?? null;
  if (familyGroupName && familyGroupName.length > MAX_FAMILY_GROUP_NAME_LENGTH) {
    return fail(c, 400, `familyGroupName must be <= ${MAX_FAMILY_GROUP_NAME_LENGTH} chars`);
  }
  if (systemEmail && systemEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `systemEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (userEmail && userEmail.length > MAX_EMAIL_LENGTH) {
    return fail(c, 400, `userEmail must be <= ${MAX_EMAIL_LENGTH} chars`);
  }
  if (systemEmail && !EMAIL_PATTERN.test(systemEmail)) {
    return fail(c, 400, "systemEmail must be a valid email");
  }
  if (userEmail && !EMAIL_PATTERN.test(userEmail)) {
    return fail(c, 400, "userEmail must be a valid email");
  }

  const changeNotesRaw = (
    body?.changeNotes && typeof body.changeNotes === "object"
      ? body.changeNotes
      : {}
  ) as Partial<Record<UserProfileChangeField, unknown>>;
  const changeNotes: Partial<Record<UserProfileChangeField, string | null>> = {
    [UserProfileChangeField.SYSTEM_EMAIL]: normalizeProfileChangeNote(
      changeNotesRaw[UserProfileChangeField.SYSTEM_EMAIL]
    ),
    [UserProfileChangeField.FAMILY_GROUP_NAME]: normalizeProfileChangeNote(
      changeNotesRaw[UserProfileChangeField.FAMILY_GROUP_NAME]
    ),
    [UserProfileChangeField.USER_EMAIL]: normalizeProfileChangeNote(
      changeNotesRaw[UserProfileChangeField.USER_EMAIL]
    )
  };

  for (const field of Object.values(UserProfileChangeField)) {
    const note = changeNotes[field];
    if (note && note.length > MAX_PROFILE_CHANGE_NOTE_LENGTH) {
      return fail(c, 400, `change note for ${field} must be <= ${MAX_PROFILE_CHANGE_NOTE_LENGTH} chars`);
    }
  }

  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  const hasInviteCodeColumn = await hasUsersInviteCodeColumn(c.env.DB);
  const hasAliasTable = await hasInviteAliasesTable(c.env.DB);
  const tokenVersionSelect = hasTokenVersionColumn
    ? "token_version"
    : `${DEFAULT_USER_TOKEN_VERSION} AS token_version`;
  const systemInviteCodeSelect = hasInviteCodeColumn
    ? "system_invite_code"
    : "NULL AS system_invite_code";
  const customInviteCodeSelect = hasAliasTable
    ? `(SELECT alias
        FROM invite_aliases
        WHERE user_id = users.id AND status = 'active'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1) AS custom_invite_code`
    : "NULL AS custom_invite_code";
  const user = await c.env.DB.prepare(
    `SELECT
      id,
      username,
      system_email,
      family_group_name,
      user_email,
      ${systemInviteCodeSelect},
      ${customInviteCodeSelect},
      expire_at,
      created_at,
      updated_at,
      ${tokenVersionSelect},
      access_token_hash
    FROM users
    WHERE id = ?
    LIMIT 1`
  )
    .bind(userId)
    .first<UserRow>();
  if (!user) {
    return fail(c, 404, "user not found");
  }

  const profileChanges: Array<{
    field: UserProfileChangeField;
    beforeValue: string | null;
    afterValue: string | null;
    changeNote: string | null;
  }> = [];
  if ((user.system_email ?? null) !== systemEmail) {
    profileChanges.push({
      field: UserProfileChangeField.SYSTEM_EMAIL,
      beforeValue: user.system_email ?? null,
      afterValue: systemEmail,
      changeNote: changeNotes[UserProfileChangeField.SYSTEM_EMAIL] ?? null
    });
  }
  if ((user.family_group_name ?? null) !== (familyGroupName ?? null)) {
    profileChanges.push({
      field: UserProfileChangeField.FAMILY_GROUP_NAME,
      beforeValue: user.family_group_name ?? null,
      afterValue: familyGroupName ?? null,
      changeNote: changeNotes[UserProfileChangeField.FAMILY_GROUP_NAME] ?? null
    });
  }
  if ((user.user_email ?? null) !== userEmail) {
    profileChanges.push({
      field: UserProfileChangeField.USER_EMAIL,
      beforeValue: user.user_email ?? null,
      afterValue: userEmail,
      changeNote: changeNotes[UserProfileChangeField.USER_EMAIL] ?? null
    });
  }

  for (const change of profileChanges) {
    if (!change.changeNote) {
      return fail(c, 400, `change note is required for ${change.field}`);
    }
  }

  const usernameChanged = user.username !== username;
  const hasAnyChange = usernameChanged || profileChanges.length > 0;
  const now = getCurrentTimestamp();
  const session = c.get("adminSession");

  try {
    if (hasAnyChange) {
      await c.env.DB.prepare(
        `UPDATE users
         SET username = ?, system_email = ?, family_group_name = ?, user_email = ?, updated_at = ?
         WHERE id = ?`
      )
        .bind(username, systemEmail, familyGroupName ?? null, userEmail, now, userId)
        .run();
    }

    if (profileChanges.length > 0) {
      const changeBatchId = crypto.randomUUID();
      const statements = profileChanges.map((change) =>
        c.env.DB.prepare(
          `INSERT INTO user_profile_change_logs (
            id,
            change_batch_id,
            user_id,
            field_name,
            before_value,
            after_value,
            change_note,
            operator_admin_id,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            crypto.randomUUID(),
            changeBatchId,
            userId,
            change.field,
            change.beforeValue,
            change.afterValue,
            change.changeNote,
            session.adminId,
            now
          )
      );

      await c.env.DB.batch(statements);
    }
  } catch (error) {
    console.error("update user profile failed", error);
    return fail(c, 500, "failed to update user");
  }

  const nextRow: UserRow = {
    ...user,
    username,
    system_email: systemEmail,
    family_group_name: familyGroupName ?? null,
    user_email: userEmail,
    updated_at: hasAnyChange ? now : user.updated_at
  };
  const payload: AdminUpdateUserResponseDTO = {
    user: await toAdminUserDTO(nextRow, tokenSecret)
  };

  return ok(c, payload);
});

app.post("/api/admin/users/:id/referral/bind", async (c) => {
  const referralCheck = await requireReferralTables(c);
  if (!referralCheck.ok) {
    return referralCheck.response;
  }

  const inviteeUserId = c.req.param("id")?.trim();
  if (!inviteeUserId) {
    return fail(c, 400, "user id is required");
  }

  const body = await c.req
    .json<Partial<AdminBindUserReferralRequestDTO>>()
    .catch(() => null);
  const inviterCodeInput = normalizeInviteCode(body?.inviterCode);
  const inviterUserIdInput = normalizeInviteCode(body?.inviterUserId);
  const inviterLookupInput = inviterCodeInput ?? inviterUserIdInput;
  if (!inviterLookupInput) {
    return fail(c, 400, "inviterCode is required");
  }
  const inviterUserId = await resolveInviterUserIdByCode(c.env.DB, inviterLookupInput);
  if (!inviterUserId) {
    return fail(c, 400, "inviter not found by invite code");
  }

  const bindResult = await bindUserReferral(c.env.DB, {
    inviterUserId,
    inviteeUserId,
    boundByAdminId: c.get("adminSession").adminId,
    now: getCurrentTimestamp(),
    checkProfileAbuse: await hasUsersExtraProfileColumns(c.env.DB)
  });
  if (!bindResult.ok) {
    if (bindResult.code === "INVITEE_ALREADY_BOUND") {
      return fail(c, 409, bindResult.message);
    }
    return fail(c, 400, bindResult.message);
  }

  const payload: AdminBindUserReferralResponseDTO = {
    inviterUserId: bindResult.inviterUserId,
    inviteeUserId: bindResult.inviteeUserId,
    boundAt: bindResult.boundAt
  };
  return ok(c, payload);
});

app.put("/api/admin/users/:id/invite-code", async (c) => {
  const inviteCodeCheck = await requireInviteCodeSupport(c);
  if (!inviteCodeCheck.ok) {
    return inviteCodeCheck.response;
  }

  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }
  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  const tokenVersionSelect = hasTokenVersionColumn
    ? "token_version"
    : `${DEFAULT_USER_TOKEN_VERSION} AS token_version`;

  const body = await c.req
    .json<Partial<AdminUpdateUserInviteCodeRequestDTO>>()
    .catch(() => null);
  const customInviteCodeInput = normalizeInviteCode(body?.customInviteCode);
  const now = getCurrentTimestamp();
  const adminId = c.get("adminSession").adminId;

  const userRow = await c.env.DB
    .prepare(
      `SELECT
        id,
        username,
        system_email,
        family_group_name,
        user_email,
        system_invite_code,
        expire_at,
        created_at,
        updated_at,
        ${tokenVersionSelect},
        access_token_hash
       FROM users
       WHERE id = ?
       LIMIT 1`
    )
    .bind(userId)
    .first<UserRow>();
  if (!userRow) {
    return fail(c, 404, "user not found");
  }

  if (customInviteCodeInput) {
    const upsertResult = await upsertUserCustomInviteAlias(c.env.DB, {
      userId,
      customInviteCode: customInviteCodeInput,
      adminId,
      now
    });
    if (!upsertResult.ok) {
      return fail(c, upsertResult.status, upsertResult.message);
    }
  } else {
    await c.env.DB
      .prepare(
        `UPDATE invite_aliases
         SET status = 'disabled', updated_by_admin_id = ?, updated_at = ?
         WHERE user_id = ? AND status = 'active'`
      )
      .bind(adminId, now, userId)
      .run();
  }

  const activeAlias = await c.env.DB
    .prepare(
      `SELECT alias
       FROM invite_aliases
       WHERE user_id = ? AND status = 'active'
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`
    )
    .bind(userId)
    .first<{ alias: string }>();

  const payload: AdminUpdateUserInviteCodeResponseDTO = {
    user: await toAdminUserDTO(
      {
        ...userRow,
        custom_invite_code: activeAlias?.alias ?? null
      },
      tokenSecret
    )
  };

  return ok(c, payload);
});

app.post("/api/admin/users/:id/recharge", async (c) => {
  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const migrationCheck = await requireRechargeTimelineColumns(c);
  if (!migrationCheck.ok) {
    return migrationCheck.response;
  }
  const externalNoteMigrationCheck = await requireRechargeExternalNoteColumn(c);
  if (!externalNoteMigrationCheck.ok) {
    return externalNoteMigrationCheck.response;
  }
  const refundMigrationCheck = await requireRechargeRefundColumns(c);
  if (!refundMigrationCheck.ok) {
    return refundMigrationCheck.response;
  }
  const referralMigrationCheck = await requireReferralTables(c);
  if (!referralMigrationCheck.ok) {
    return referralMigrationCheck.response;
  }

  const body = await c.req.json<Partial<AdminRechargeUserRequestDTO>>().catch(() => null);
  const days = Number(body?.days);
  const reasonRaw = typeof body?.reason === "string" ? body.reason : "";
  const paymentAmount = normalizePaymentAmount(body?.paymentAmount);
  const internalNote = normalizeInternalNote(body?.internalNote);
  const externalNote = normalizeInternalNote(body?.externalNote);

  if (!Number.isInteger(days) || days <= 0 || days > MAX_RECHARGE_DAYS) {
    return fail(c, 400, `days must be an integer between 1 and ${MAX_RECHARGE_DAYS}`);
  }
  if (!isRechargeReason(reasonRaw)) {
    return fail(c, 400, "invalid recharge reason");
  }
  if (paymentAmount === null || paymentAmount < 0 || paymentAmount > MAX_PAYMENT_AMOUNT) {
    return fail(c, 400, `paymentAmount must be between 0 and ${MAX_PAYMENT_AMOUNT}`);
  }
  if (internalNote && internalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
    return fail(c, 400, `internalNote must be <= ${MAX_INTERNAL_NOTE_LENGTH} chars`);
  }
  if (externalNote && externalNote.length > MAX_EXTERNAL_NOTE_LENGTH) {
    return fail(c, 400, `externalNote must be <= ${MAX_EXTERNAL_NOTE_LENGTH} chars`);
  }

  try {
    const now = getCurrentTimestamp();
    const payload = await createAndRebuildRechargeRecord(c, {
      userId,
      days,
      reason: reasonRaw,
      paymentAmountCents: toPaymentAmountCents(paymentAmount),
      internalNote,
      externalNote,
      occurredAt: now,
      source: RechargeRecordSource.NORMAL
    });
    if (!payload) {
      return fail(c, 404, "user not found");
    }

    try {
      await applyReferralEffectsForRecharge(c, {
        userId,
        recharge: payload,
        occurredAt: now
      });
    } catch (error) {
      console.error("apply referral effect after recharge failed", error);
    }

    return ok(c, payload);
  } catch (error) {
    console.error("recharge failed", error);
    return fail(c, 500, "failed to recharge user");
  }
});

app.post("/api/admin/users/:id/recharge/backfill", async (c) => {
  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const migrationCheck = await requireRechargeTimelineColumns(c);
  if (!migrationCheck.ok) {
    return migrationCheck.response;
  }
  const externalNoteMigrationCheck = await requireRechargeExternalNoteColumn(c);
  if (!externalNoteMigrationCheck.ok) {
    return externalNoteMigrationCheck.response;
  }
  const refundMigrationCheck = await requireRechargeRefundColumns(c);
  if (!refundMigrationCheck.ok) {
    return refundMigrationCheck.response;
  }
  const referralMigrationCheck = await requireReferralTables(c);
  if (!referralMigrationCheck.ok) {
    return referralMigrationCheck.response;
  }

  const body = await c.req.json<Partial<AdminBackfillRechargeRequestDTO>>().catch(() => null);
  const days = Number(body?.days);
  const reasonRaw = typeof body?.reason === "string" ? body.reason : "";
  const paymentAmount = normalizePaymentAmount(body?.paymentAmount);
  const occurredAt = Number(body?.occurredAt);
  const internalNote = normalizeInternalNote(body?.internalNote);
  const grantReferralReward = body?.grantReferralReward === true;
  const externalNote = normalizeInternalNote(body?.externalNote);
  const now = getCurrentTimestamp();
  const auditedInternalNote = buildBackfillAuditInternalNote(internalNote, grantReferralReward);

  if (!Number.isInteger(days) || days <= 0 || days > MAX_RECHARGE_DAYS) {
    return fail(c, 400, `days must be an integer between 1 and ${MAX_RECHARGE_DAYS}`);
  }
  if (!isRechargeReason(reasonRaw)) {
    return fail(c, 400, "invalid recharge reason");
  }
  if (paymentAmount === null || paymentAmount < 0 || paymentAmount > MAX_PAYMENT_AMOUNT) {
    return fail(c, 400, `paymentAmount must be between 0 and ${MAX_PAYMENT_AMOUNT}`);
  }
  if (!Number.isInteger(occurredAt) || occurredAt <= 0) {
    return fail(c, 400, "occurredAt must be a positive unix timestamp");
  }
  if (occurredAt > now) {
    return fail(c, 400, "occurredAt cannot be in the future");
  }
  if (auditedInternalNote.length > MAX_INTERNAL_NOTE_LENGTH) {
    return fail(c, 400, `internalNote must be <= ${MAX_INTERNAL_NOTE_LENGTH} chars`);
  }
  if (externalNote && externalNote.length > MAX_EXTERNAL_NOTE_LENGTH) {
    return fail(c, 400, `externalNote must be <= ${MAX_EXTERNAL_NOTE_LENGTH} chars`);
  }

  try {
    const payload = await createAndRebuildRechargeRecord(c, {
      userId,
      days,
      reason: reasonRaw,
      paymentAmountCents: toPaymentAmountCents(paymentAmount),
      internalNote: auditedInternalNote,
      externalNote,
      occurredAt,
      source: RechargeRecordSource.BACKFILL
    });
    if (!payload) {
      return fail(c, 404, "user not found");
    }

    try {
      await applyReferralEffectsForRecharge(c, {
        userId,
        recharge: payload,
        occurredAt: now,
        allowBackfillReward: grantReferralReward
      });
    } catch (error) {
      console.error("apply referral effect after backfill failed", error);
    }

    return ok(c, payload);
  } catch (error) {
    console.error("recharge backfill failed", error);
    return fail(c, 500, "failed to backfill recharge record");
  }
});

app.post("/api/admin/recharge-records/:id/refund", async (c) => {
  const rechargeRecordId = c.req.param("id")?.trim();
  if (!rechargeRecordId) {
    return fail(c, 400, "recharge record id is required");
  }

  const timelineMigrationCheck = await requireRechargeTimelineColumns(c);
  if (!timelineMigrationCheck.ok) {
    return timelineMigrationCheck.response;
  }
  const externalNoteMigrationCheck = await requireRechargeExternalNoteColumn(c);
  if (!externalNoteMigrationCheck.ok) {
    return externalNoteMigrationCheck.response;
  }
  const refundMigrationCheck = await requireRechargeRefundColumns(c);
  if (!refundMigrationCheck.ok) {
    return refundMigrationCheck.response;
  }
  const referralMigrationCheck = await requireReferralTables(c);
  if (!referralMigrationCheck.ok) {
    return referralMigrationCheck.response;
  }

  const body = await c.req
    .json<Partial<AdminRefundRechargeRequestDTO>>()
    .catch(() => null);
  const refundAmount = normalizePaymentAmount(body?.refundAmount);
  const refundNote = normalizeInternalNote(body?.refundNote);
  if (refundNote && refundNote.length > MAX_REFUND_NOTE_LENGTH) {
    return fail(c, 400, `refundNote must be <= ${MAX_REFUND_NOTE_LENGTH} chars`);
  }

  const target = await c.env.DB
    .prepare(
      `SELECT
        r.id,
        r.user_id,
        u.username,
        r.reason,
        r.source,
        r.change_days,
        r.payment_amount_cents,
        r.expire_before,
        r.expire_after,
        r.refunded_at
       FROM recharge_records AS r
       INNER JOIN users AS u ON u.id = r.user_id
       WHERE r.id = ?
       LIMIT 1`
    )
    .bind(rechargeRecordId)
    .first<RechargeRefundTargetWithUserRow>();
  if (!target) {
    return fail(c, 404, "recharge record not found");
  }
  if (target.refunded_at && target.refunded_at > 0) {
    return fail(c, 409, "recharge record already refunded");
  }
  if ((target.change_days || 0) <= 0) {
    return fail(c, 400, "only positive recharge records can be refunded");
  }
  if (target.source === RechargeRecordSource.REFUND_ROLLBACK) {
    return fail(c, 400, "refund rollback records cannot be refunded again");
  }

  const now = getCurrentTimestamp();
  const refundUsage = calculateRefundUsageSnapshot(target, now);
  if (refundUsage.refundableDays <= 0 || refundUsage.refundableAmountCents <= 0) {
    return fail(c, 400, "no refundable days left for this recharge record");
  }

  const resolvedRefundAmount = toPaymentAmount(refundUsage.refundableAmountCents);
  if (refundAmount !== null) {
    const requestedRefundAmount = Number(refundAmount.toFixed(2));
    if (requestedRefundAmount !== resolvedRefundAmount) {
      return fail(
        c,
        400,
        `refundAmount must equal ${resolvedRefundAmount.toFixed(2)} under remaining-days refund rule`
      );
    }
  }

  if (resolvedRefundAmount < 0) {
    return fail(
      c,
      400,
      `refundAmount must be ${resolvedRefundAmount.toFixed(2)}`
    );
  }

  const session = c.get("adminSession");
  const markResult = await c.env.DB
    .prepare(
      `UPDATE recharge_records
       SET refunded_at = ?, refund_note = ?, refunded_by_admin_id = ?, refund_amount_cents = ?
       WHERE id = ? AND refunded_at IS NULL`
    )
    .bind(
      now,
      refundNote,
      session.adminId,
      refundUsage.refundableAmountCents,
      rechargeRecordId
    )
    .run();
  if (Number(markResult.meta?.changes || 0) === 0) {
    return fail(c, 409, "recharge record already refunded");
  }

  try {
    const rollbackPayload = await createAndRebuildRechargeRecord(c, {
      userId: target.user_id,
      days: -refundUsage.refundableDays,
      reason: RechargeReason.MANUAL_FIX,
      paymentAmountCents: 0,
      internalNote: `refund rollback for recharge record ${rechargeRecordId}`,
      externalNote: "退款回滚会员天数",
      occurredAt: now,
      source: RechargeRecordSource.REFUND_ROLLBACK
    });
    if (!rollbackPayload) {
      return fail(c, 404, "target user not found");
    }

    await cancelReferralRewardsByRechargeRecord(c.env.DB, {
      rechargeRecordId,
      refundAmountCents: refundUsage.refundableAmountCents,
      reason: "recharge refunded",
      now
    });

    const bonusGrant = await findGrantedBonusByTriggerRechargeRecord(
      c.env.DB,
      rechargeRecordId
    );
    if (bonusGrant) {
      const bonusRollback = await createAndRebuildRechargeRecord(c, {
        userId: bonusGrant.invitee_user_id,
        days: -Math.abs(bonusGrant.bonus_days),
        reason: RechargeReason.MANUAL_FIX,
        paymentAmountCents: 0,
        internalNote: `revoke invite bonus for refunded recharge ${rechargeRecordId}`,
        externalNote: "退款撤销邀请首单赠送",
        occurredAt: now,
        source: RechargeRecordSource.REFUND_ROLLBACK
      });

      if (bonusRollback) {
        await markBonusGrantRevoked(c.env.DB, {
          bonusGrantId: bonusGrant.id,
          revokeRechargeRecordId: bonusRollback.record.id,
          now
        });
      }
    }

    const originalRecord = await getRechargeRecordById(c.env.DB, rechargeRecordId);
    if (!originalRecord) {
      return fail(c, 500, "refunded recharge record not found");
    }

    const payload: AdminRefundRechargeResponseDTO = {
      user: rollbackPayload.user,
      originalRecord: toAdminRechargeRecordDTO(originalRecord),
      refundRecord: rollbackPayload.record
    };
    return ok(c, payload);
  } catch (error) {
    console.error("refund recharge failed", error);
    return fail(c, 500, "failed to refund recharge record");
  }
});

app.post("/api/admin/users/:id/reset-token", async (c) => {
  const tokenSecret = getUserTokenSecret(c.env);
  if (!tokenSecret) {
    return fail(c, 500, "user token secret is not configured");
  }

  const userId = c.req.param("id")?.trim();
  if (!userId) {
    return fail(c, 400, "user id is required");
  }

  const hasTokenVersionColumn = await hasUsersTokenVersionColumn(c.env.DB);
  if (!hasTokenVersionColumn) {
    return fail(c, 500, "token reset requires users.token_version migration");
  }
  const hasUsersProfileColumns = await hasUsersExtraProfileColumns(c.env.DB);
  const profileSelect = hasUsersProfileColumns
    ? "system_email, family_group_name, user_email,"
    : "NULL AS system_email, NULL AS family_group_name, NULL AS user_email,";

  const now = getCurrentTimestamp();
  const session = c.get("adminSession");

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user = await c.env.DB.prepare(
        `SELECT
          id,
          username,
          ${profileSelect}
          expire_at,
          created_at,
          token_version,
          access_token_hash
        FROM users
        WHERE id = ?
        LIMIT 1`
      )
        .bind(userId)
        .first<ResetTokenTargetUserRow>();

      if (!user) {
        return fail(c, 404, "user not found");
      }

      const oldTokenHash = user.access_token_hash;
      const nextTokenVersion = Math.max(
        user.token_version || DEFAULT_USER_TOKEN_VERSION,
        DEFAULT_USER_TOKEN_VERSION
      ) + 1;
      const nextStatusToken = await buildUserStatusToken(
        user.id,
        nextTokenVersion,
        tokenSecret
      );
      const newTokenHash = await sha256Hex(nextStatusToken);
      const updateResult = await c.env.DB.prepare(
        `UPDATE users
         SET access_token_hash = ?, token_version = ?, updated_at = ?
         WHERE id = ? AND access_token_hash = ? AND token_version = ?`
      )
        .bind(
          newTokenHash,
          nextTokenVersion,
          now,
          user.id,
          oldTokenHash,
          user.token_version
        )
        .run();
      const updateChanges = Number(updateResult.meta?.changes || 0);

      if (updateChanges === 0) {
        continue;
      }

      const resetLogId = crypto.randomUUID();
      await c.env.DB.prepare(
        `INSERT INTO token_reset_logs (
          id,
          user_id,
          old_token_hash,
          new_token_hash,
          operator_admin_id,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          resetLogId,
          user.id,
          oldTokenHash,
          newTokenHash,
          session.adminId,
          now
        )
        .run();

      const payload: AdminResetUserTokenResponseDTO = {
        user: {
          id: user.id,
          username: user.username,
          systemEmail: user.system_email ?? null,
          familyGroupName: user.family_group_name ?? null,
          userEmail: user.user_email ?? null,
          expireAt: user.expire_at,
          createdAt: user.created_at,
          updatedAt: now,
          tokenVersion: nextTokenVersion,
          statusToken: nextStatusToken
        }
      };

      return ok(c, payload);
    }
  } catch (error) {
    console.error("reset token failed", error);
    return fail(c, 500, "failed to reset user token");
  }

  return fail(c, 500, "reset token conflict, please retry");
});

app.get("/api/admin/recharge-records", async (c) => {
  const rawLimit = Number(c.req.query("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RECHARGE_RECORD_LIMIT)
      : DEFAULT_RECHARGE_RECORD_LIMIT;
  const hasRechargeTimeline = await hasRechargeTimelineColumns(c.env.DB);
  const hasRechargeExternalNote = await hasRechargeExternalNoteColumn(c.env.DB);
  const hasRechargeRefund = await hasRechargeRefundColumns(c.env.DB);
  const externalNoteSelect = hasRechargeExternalNote
    ? "r.external_note AS external_note"
    : "NULL AS external_note";
  const refundedAtSelect = hasRechargeRefund
    ? "r.refunded_at AS refunded_at"
    : "NULL AS refunded_at";
  const refundedByAdminIdSelect = hasRechargeRefund
    ? "r.refunded_by_admin_id AS refunded_by_admin_id"
    : "NULL AS refunded_by_admin_id";
  const refundAmountSelect = hasRechargeRefund
    ? "r.refund_amount_cents AS refund_amount_cents"
    : "0 AS refund_amount_cents";
  const refundNoteSelect = hasRechargeRefund
    ? "r.refund_note AS refund_note"
    : "NULL AS refund_note";
  const rows = hasRechargeTimeline
    ? await c.env.DB.prepare(
      `SELECT
        r.id,
        r.user_id,
        u.username AS username,
        r.change_days,
        r.reason,
        r.payment_amount_cents,
        r.internal_note,
        ${externalNoteSelect},
        r.expire_before,
        r.expire_after,
        r.operator_admin_id,
        a.username AS operator_admin_username,
        r.occurred_at,
        r.recorded_at,
        r.source,
        ${refundedAtSelect},
        ${refundedByAdminIdSelect},
        ${refundAmountSelect},
        ${refundNoteSelect},
        r.created_at
      FROM recharge_records AS r
      INNER JOIN users AS u ON u.id = r.user_id
      INNER JOIN admin_users AS a ON a.id = r.operator_admin_id
      ORDER BY COALESCE(r.occurred_at, r.created_at) DESC, r.id DESC
      LIMIT ?`
    )
      .bind(limit)
      .all<RechargeRecordRow>()
    : await c.env.DB.prepare(
      `SELECT
        r.id,
        r.user_id,
        u.username AS username,
        r.change_days,
        r.reason,
        0 AS payment_amount_cents,
        r.internal_note,
        NULL AS external_note,
        r.expire_before,
        r.expire_after,
        r.operator_admin_id,
        a.username AS operator_admin_username,
        NULL AS occurred_at,
        NULL AS recorded_at,
        'normal' AS source,
        NULL AS refunded_at,
        NULL AS refunded_by_admin_id,
        0 AS refund_amount_cents,
        NULL AS refund_note,
        r.created_at
      FROM recharge_records AS r
      INNER JOIN users AS u ON u.id = r.user_id
      INNER JOIN admin_users AS a ON a.id = r.operator_admin_id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ?`
    )
      .bind(limit)
      .all<RechargeRecordRow>();

  const payload: AdminListRechargeRecordsResponseDTO = {
    items: (rows.results || []).map((row) => toAdminRechargeRecordDTO(row)),
    limit
  };

  return ok(c, payload);
});

app.get("/api/admin/referral/dashboard", async (c) => {
  const referralCheck = await requireReferralTables(c);
  if (!referralCheck.ok) {
    return referralCheck.response;
  }

  await unlockPendingReferralRewards(c.env.DB, getCurrentTimestamp());
  const payload: AdminReferralDashboardDTO = await getReferralDashboard(c.env.DB);
  return ok(c, payload);
});

app.post("/api/admin/referral-rewards/unlock", async (c) => {
  const referralCheck = await requireReferralTables(c);
  if (!referralCheck.ok) {
    return referralCheck.response;
  }

  const now = getCurrentTimestamp();
  const changed = await unlockPendingReferralRewards(c.env.DB, now);
  return ok(c, { changed, executedAt: now });
});

app.get("/api/admin/referral-rewards", async (c) => {
  const referralCheck = await requireReferralTables(c);
  if (!referralCheck.ok) {
    return referralCheck.response;
  }

  await unlockPendingReferralRewards(c.env.DB, getCurrentTimestamp());

  const rawLimit = Number(c.req.query("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RECHARGE_RECORD_LIMIT)
      : DEFAULT_RECHARGE_RECORD_LIMIT;
  const statusRaw = (c.req.query("status") || "all").trim();
  const status =
    statusRaw === "all" ||
    statusRaw === ReferralRewardStatus.PENDING ||
    statusRaw === ReferralRewardStatus.AVAILABLE ||
    statusRaw === ReferralRewardStatus.CANCELED ||
    statusRaw === ReferralRewardStatus.WITHDRAWN
      ? statusRaw
      : null;
  if (!status) {
    return fail(c, 400, "invalid referral reward status");
  }

  const rows =
    status === "all"
      ? await c.env.DB
        .prepare(
          `SELECT
            l.id,
            l.inviter_user_id,
            inviter.username AS inviter_username,
            l.invitee_user_id,
            invitee.username AS invitee_username,
            l.recharge_record_id,
            l.recharge_reason,
            l.recharge_source,
            l.payment_amount_cents,
            l.reward_rate_bps,
            l.reward_amount_cents,
            l.unlock_start_at,
            l.total_days,
            l.unlocked_days,
            l.unlocked_amount_cents,
            l.withdrawn_amount_cents,
            l.status,
            l.unlock_at,
            l.available_at,
            l.fully_unlocked_at,
            l.canceled_at,
            l.canceled_reason,
            l.withdrawn_at,
            l.withdrawal_id,
            l.created_at,
            l.updated_at
           FROM referral_reward_ledger AS l
           INNER JOIN users AS inviter ON inviter.id = l.inviter_user_id
           INNER JOIN users AS invitee ON invitee.id = l.invitee_user_id
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT ?`
        )
        .bind(limit)
        .all<ReferralRewardLedgerRow>()
      : await c.env.DB
        .prepare(
          `SELECT
            l.id,
            l.inviter_user_id,
            inviter.username AS inviter_username,
            l.invitee_user_id,
            invitee.username AS invitee_username,
            l.recharge_record_id,
            l.recharge_reason,
            l.recharge_source,
            l.payment_amount_cents,
            l.reward_rate_bps,
            l.reward_amount_cents,
            l.unlock_start_at,
            l.total_days,
            l.unlocked_days,
            l.unlocked_amount_cents,
            l.withdrawn_amount_cents,
            l.status,
            l.unlock_at,
            l.available_at,
            l.fully_unlocked_at,
            l.canceled_at,
            l.canceled_reason,
            l.withdrawn_at,
            l.withdrawal_id,
            l.created_at,
            l.updated_at
           FROM referral_reward_ledger AS l
           INNER JOIN users AS inviter ON inviter.id = l.inviter_user_id
           INNER JOIN users AS invitee ON invitee.id = l.invitee_user_id
           WHERE l.status = ?
           ORDER BY l.created_at DESC, l.id DESC
           LIMIT ?`
        )
        .bind(status, limit)
        .all<ReferralRewardLedgerRow>();

  const payload: AdminListReferralRewardsResponseDTO = {
    items: (rows.results || []).map((row) => toAdminReferralRewardRecordDTO(row)),
    limit,
    status
  };
  return ok(c, payload);
});

app.get("/api/admin/referral-withdrawals", async (c) => {
  const referralCheck = await requireReferralTables(c);
  if (!referralCheck.ok) {
    return referralCheck.response;
  }

  const rawLimit = Number(c.req.query("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_RECHARGE_RECORD_LIMIT)
      : DEFAULT_RECHARGE_RECORD_LIMIT;
  const rows = await c.env.DB
    .prepare(
      `SELECT
        w.id,
        w.inviter_user_id,
        inviter.username AS inviter_username,
        w.amount_cents,
        w.gross_amount_cents,
        w.debt_offset_cents,
        w.processed_by_admin_id,
        admin.username AS processed_by_admin_username,
        w.note,
        w.created_at
       FROM referral_withdrawals AS w
       INNER JOIN users AS inviter ON inviter.id = w.inviter_user_id
       INNER JOIN admin_users AS admin ON admin.id = w.processed_by_admin_id
       ORDER BY w.created_at DESC, w.id DESC
       LIMIT ?`
    )
    .bind(limit)
    .all<ReferralWithdrawalRow>();

  const payload: AdminListReferralWithdrawalsResponseDTO = {
    items: (rows.results || []).map((row) => toAdminReferralWithdrawalDTO(row)),
    limit
  };
  return ok(c, payload);
});

app.post("/api/admin/referral-withdrawals", async (c) => {
  const referralCheck = await requireReferralTables(c);
  if (!referralCheck.ok) {
    return referralCheck.response;
  }

  const body = await c.req
    .json<Partial<AdminWithdrawReferralRewardsRequestDTO>>()
    .catch(() => null);
  const inviterUserId =
    typeof body?.inviterUserId === "string" ? body.inviterUserId.trim() : "";
  if (!inviterUserId) {
    return fail(c, 400, "inviterUserId is required");
  }
  const note = normalizeWithdrawNote(body?.note);
  if (note && note.length > MAX_WITHDRAW_NOTE_LENGTH) {
    return fail(c, 400, `note must be <= ${MAX_WITHDRAW_NOTE_LENGTH} chars`);
  }

  const now = getCurrentTimestamp();
  const withdrawResult = await withdrawAvailableReferralRewards(c.env.DB, {
    inviterUserId,
    processedByAdminId: c.get("adminSession").adminId,
    note,
    now
  });
  if (!withdrawResult) {
    return fail(c, 400, "no available referral rewards to withdraw");
  }

  const withdrawal = await c.env.DB
    .prepare(
      `SELECT
        w.id,
        w.inviter_user_id,
        inviter.username AS inviter_username,
        w.amount_cents,
        w.gross_amount_cents,
        w.debt_offset_cents,
        w.processed_by_admin_id,
        admin.username AS processed_by_admin_username,
        w.note,
        w.created_at
       FROM referral_withdrawals AS w
       INNER JOIN users AS inviter ON inviter.id = w.inviter_user_id
       INNER JOIN admin_users AS admin ON admin.id = w.processed_by_admin_id
       WHERE w.id = ?
       LIMIT 1`
    )
    .bind(withdrawResult.withdrawalId)
    .first<ReferralWithdrawalRow>();
  if (!withdrawal) {
    return fail(c, 500, "withdrawal record not found");
  }

  const payload: AdminWithdrawReferralRewardsResponseDTO = {
    withdrawal: toAdminReferralWithdrawalDTO(withdrawal),
    withdrawnCount: withdrawResult.withdrawnCount,
    withdrawnAmount: toPaymentAmount(withdrawResult.withdrawnAmountCents),
    grossAmount: toPaymentAmount(withdrawResult.grossAmountCents),
    debtOffsetAmount: toPaymentAmount(withdrawResult.debtOffsetCents)
  };
  return ok(c, payload);
});

app.get("/api/admin/user-profile-change-logs", async (c) => {
  const rawLimit = Number(c.req.query("limit"));
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_PROFILE_CHANGE_LOG_LIMIT)
      : DEFAULT_PROFILE_CHANGE_LOG_LIMIT;

  try {
    const rows = await c.env.DB.prepare(
      `SELECT
        l.id,
        l.change_batch_id,
        l.user_id,
        u.username AS username,
        l.field_name,
        l.before_value,
        l.after_value,
        l.change_note,
        l.operator_admin_id,
        a.username AS operator_admin_username,
        l.created_at
      FROM user_profile_change_logs AS l
      INNER JOIN users AS u ON u.id = l.user_id
      INNER JOIN admin_users AS a ON a.id = l.operator_admin_id
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT ?`
    )
      .bind(limit)
      .all<UserProfileChangeLogRow>();
    const payload: AdminListUserProfileChangeLogsResponseDTO = {
      items: (rows.results || []).map((row) => toAdminUserProfileChangeRecordDTO(row)),
      limit
    };

    return ok(c, payload);
  } catch (error) {
    console.error("list user profile change logs failed", error);
    return fail(c, 500, "database migration required: user profile change logs table missing");
  }
});

app.get("/api/admin/dashboard/today", async (c) => {
  const range = toUtc8DayRange(getCurrentTimestamp());
  const hasRechargeTimeline = await hasRechargeTimelineColumns(c.env.DB);
  const row = hasRechargeTimeline
    ? await c.env.DB.prepare(
      `SELECT
        COUNT(*) AS recharge_count,
        COALESCE(SUM(change_days), 0) AS total_change_days
      FROM recharge_records
      WHERE COALESCE(recorded_at, created_at) >= ? AND COALESCE(recorded_at, created_at) < ?`
    )
      .bind(range.dayStartAt, range.dayEndAt)
      .first<DashboardTodayRow>()
    : await c.env.DB.prepare(
      `SELECT
        COUNT(*) AS recharge_count,
        COALESCE(SUM(change_days), 0) AS total_change_days
      FROM recharge_records
      WHERE created_at >= ? AND created_at < ?`
    )
      .bind(range.dayStartAt, range.dayEndAt)
      .first<DashboardTodayRow>();

  const payload: AdminDashboardTodayDTO = {
    dayStartAt: range.dayStartAt,
    dayEndAt: range.dayEndAt,
    rechargeCount: Number(row?.recharge_count || 0),
    totalChangeDays: Number(row?.total_change_days || 0)
  };

  return ok(c, payload);
});

app.post("/api/admin/logout", (c) => {
  deleteCookie(c, ADMIN_SESSION_COOKIE, {
    path: "/"
  });

  return ok(c, { success: true });
});

app.get("/", (c) => {
  return c.text("VIP membership backend is running.");
});

const scheduled: ExportedHandlerScheduledHandler<Bindings> = async (
  _event,
  env,
  _ctx
) => {
  const hasTables =
    (await hasReferralTables(env.DB)) &&
    (await hasReferralDailyUnlockColumns(env.DB));
  if (!hasTables) {
    return;
  }

  try {
    await unlockPendingReferralRewards(env.DB, getCurrentTimestamp());
  } catch (error) {
    console.error("scheduled unlock pending referral rewards failed", error);
  }
};

export default {
  fetch: app.fetch,
  scheduled
};

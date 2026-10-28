/**
 * Pure subscription/entitlement logic.
 *
 * No database or React here on purpose: this module is the single source of
 * truth for "is this organization allowed to operate, and what can it do",
 * so it can be unit-tested exhaustively and reused on client and server.
 */

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "EXPIRED"
  | "SUSPENDED"
  | "CANCELLED"
  | "PENDING_PAYMENT";

export interface SubscriptionInfo {
  id: string;
  orgId: string;
  planSlug: string;
  planName: string;
  status: SubscriptionStatus;
  /** ISO timestamp */
  expiresAt: string;
  maxBranches: number | null;
  maxUsers: number | null;
  features: string[];
}

export interface OrgUsage {
  branches: number;
  users: number;
}

/**
 * Effective status at a point in time. A TRIAL/ACTIVE subscription whose
 * expires_at has passed is EXPIRED — the stored status is stale until a
 * renewal happens, so the date always wins for those two states.
 * SUSPENDED/CANCELLED/PENDING_PAYMENT are explicit states and are never
 * upgraded by the clock.
 */
export function computeEffectiveStatus(
  sub: Pick<SubscriptionInfo, "status" | "expiresAt">,
  now: Date = new Date(),
): SubscriptionStatus {
  if (sub.status === "TRIAL" || sub.status === "ACTIVE") {
    return new Date(sub.expiresAt).getTime() <= now.getTime()
      ? "EXPIRED"
      : sub.status;
  }
  return sub.status;
}

/** Whole days remaining (can be negative when expired). */
export function daysLeft(expiresAt: string, now: Date = new Date()): number {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}

/** Can the organization use the system right now? */
export function isOperational(
  sub: Pick<SubscriptionInfo, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  const status = computeEffectiveStatus(sub, now);
  return status === "TRIAL" || status === "ACTIVE";
}

export function hasFeature(sub: SubscriptionInfo, feature: string): boolean {
  return sub.features.includes(feature);
}

export interface LimitViolation {
  limit: "branches" | "users";
  allowed: number;
  current: number;
}

/**
 * Check org usage against the plan limits. null limit = unlimited.
 * Returns every violation so the UI can list them all at once.
 */
export function checkLimits(sub: SubscriptionInfo, usage: OrgUsage): LimitViolation[] {
  const violations: LimitViolation[] = [];
  if (sub.maxBranches != null && usage.branches > sub.maxBranches) {
    violations.push({ limit: "branches", allowed: sub.maxBranches, current: usage.branches });
  }
  if (sub.maxUsers != null && usage.users > sub.maxUsers) {
    violations.push({ limit: "users", allowed: sub.maxUsers, current: usage.users });
  }
  return violations;
}

/** Arabic label for a status, for badges. */
export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: "تجربة مجانية",
  ACTIVE: "نشط",
  EXPIRED: "منتهي",
  SUSPENDED: "موقوف",
  CANCELLED: "ملغي",
  PENDING_PAYMENT: "بانتظار الدفع",
};

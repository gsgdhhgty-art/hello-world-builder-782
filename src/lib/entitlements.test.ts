import { describe, it, expect } from "vitest";
import {
  computeEffectiveStatus,
  daysLeft,
  isOperational,
  hasFeature,
  checkLimits,
  type SubscriptionInfo,
} from "./entitlements";

const NOW = new Date("2026-10-28T00:00:00Z");

function sub(overrides: Partial<SubscriptionInfo> = {}): SubscriptionInfo {
  return {
    id: "s1",
    orgId: "o1",
    planSlug: "trial",
    planName: "تجربة مجانية",
    status: "TRIAL",
    expiresAt: "2026-11-10T00:00:00Z",
    maxBranches: 1,
    maxUsers: 3,
    features: ["pos", "inventory"],
    ...overrides,
  };
}

describe("computeEffectiveStatus", () => {
  it("keeps TRIAL while not expired", () => {
    expect(computeEffectiveStatus(sub(), NOW)).toBe("TRIAL");
  });

  it("turns TRIAL into EXPIRED once expires_at passed", () => {
    expect(computeEffectiveStatus(sub({ expiresAt: "2026-10-27T23:59:59Z" }), NOW)).toBe("EXPIRED");
  });

  it("expires exactly at expires_at (inclusive boundary)", () => {
    expect(computeEffectiveStatus(sub({ expiresAt: NOW.toISOString() }), NOW)).toBe("EXPIRED");
  });

  it("never upgrades SUSPENDED even when dates are future", () => {
    expect(computeEffectiveStatus(sub({ status: "SUSPENDED" }), NOW)).toBe("SUSPENDED");
  });

  it("never upgrades CANCELLED even when dates are future", () => {
    expect(computeEffectiveStatus(sub({ status: "CANCELLED" }), NOW)).toBe("CANCELLED");
  });

  it("keeps PENDING_PAYMENT as-is", () => {
    expect(computeEffectiveStatus(sub({ status: "PENDING_PAYMENT" }), NOW)).toBe("PENDING_PAYMENT");
  });
});

describe("daysLeft", () => {
  it("counts whole days rounded up", () => {
    expect(daysLeft("2026-10-31T00:00:00Z", NOW)).toBe(3);
  });

  it("is negative after expiry", () => {
    expect(daysLeft("2026-10-26T00:00:00Z", NOW)).toBe(-2);
  });
});

describe("isOperational", () => {
  it("active future subscription is operational", () => {
    expect(isOperational(sub({ status: "ACTIVE" }), NOW)).toBe(true);
  });

  it("expired trial is not operational", () => {
    expect(isOperational(sub({ expiresAt: "2026-10-01T00:00:00Z" }), NOW)).toBe(false);
  });

  it("suspended is not operational", () => {
    expect(isOperational(sub({ status: "SUSPENDED" }), NOW)).toBe(false);
  });
});

describe("hasFeature", () => {
  it("true for a feature in the plan snapshot", () => {
    expect(hasFeature(sub(), "pos")).toBe(true);
  });
  it("false for a feature not in the plan", () => {
    expect(hasFeature(sub(), "multi_branch")).toBe(false);
  });
});

describe("checkLimits", () => {
  it("no violations when within limits", () => {
    expect(checkLimits(sub(), { branches: 1, users: 3 })).toEqual([]);
  });

  it("reports branch violation with concrete numbers", () => {
    expect(checkLimits(sub(), { branches: 2, users: 1 })).toEqual([
      { limit: "branches", allowed: 1, current: 2 },
    ]);
  });

  it("reports both violations at once", () => {
    expect(checkLimits(sub(), { branches: 5, users: 9 })).toEqual([
      { limit: "branches", allowed: 1, current: 5 },
      { limit: "users", allowed: 3, current: 9 },
    ]);
  });

  it("null limits mean unlimited", () => {
    expect(checkLimits(sub({ maxBranches: null, maxUsers: null }), { branches: 99, users: 99 })).toEqual([]);
  });
});

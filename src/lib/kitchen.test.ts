import { describe, expect, it } from "vitest";
import { addTicketItem, canBill, expiryBucket, nextTicketStatus, ticketTotal, ticketUrgency } from "./kitchen";

describe("kitchen flow", () => {
  it("moves forward only NEW → PREPARING → READY → SERVED", () => {
    expect(nextTicketStatus("NEW")).toBe("PREPARING");
    expect(nextTicketStatus("PREPARING")).toBe("READY");
    expect(nextTicketStatus("READY")).toBe("SERVED");
    expect(nextTicketStatus("SERVED")).toBeNull();
    expect(nextTicketStatus("BILLED")).toBeNull();
  });

  it("does not allow billing a ticket the kitchen has not accepted or that is closed", () => {
    expect(canBill("NEW")).toBe(false);
    expect(canBill("BILLED")).toBe(false);
    expect(canBill("CANCELLED")).toBe(false);
    expect(canBill("READY")).toBe(true);
  });

  it("merges the same product and totals price × qty", () => {
    let items = addTicketItem([], { product_id: "a", name: "لاتيه", price: 45 });
    items = addTicketItem(items, { product_id: "a", name: "لاتيه", price: 45 });
    items = addTicketItem(items, { product_id: "b", name: "كرواسون", price: 30 });
    expect(items).toHaveLength(2);
    expect(items[0]?.qty).toBe(2);
    expect(ticketTotal(items)).toBe(120);
  });

  it("flags tickets waiting 10 and 20 minutes", () => {
    const now = new Date("2026-10-28T12:00:00Z").getTime();
    expect(ticketUrgency("2026-10-28T11:55:00Z", now)).toBe("ok");
    expect(ticketUrgency("2026-10-28T11:48:00Z", now)).toBe("warn");
    expect(ticketUrgency("2026-10-28T11:40:00Z", now)).toBe("late");
  });
});

describe("expiry buckets", () => {
  const today = new Date(2026, 9, 28);
  it("classifies expired, 30 and 90 day windows", () => {
    expect(expiryBucket("2026-10-27", today)).toBe("expired");
    expect(expiryBucket("2026-10-28", today)).toBe("d30");
    expect(expiryBucket("2026-11-27", today)).toBe("d30");
    expect(expiryBucket("2027-01-20", today)).toBe("d90");
    expect(expiryBucket("2027-06-01", today)).toBe("ok");
    expect(expiryBucket(null, today)).toBe("none");
  });
});

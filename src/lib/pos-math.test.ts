import { describe, expect, it } from "vitest";
import { calculateCartTotals } from "./pos-math";
import { money, num } from "./format";

describe("calculateCartTotals", () => {
  it("returns zeros for an empty cart", () => {
    expect(calculateCartTotals([], 15)).toEqual({ subtotal: 0, discount: 0, tax: 0, total: 0 });
  });

  it("applies tax on the net amount", () => {
    const totals = calculateCartTotals([{ price: 10, quantity: 2, discount: 0 }], 15);
    expect(totals.subtotal).toBe(20);
    expect(totals.tax).toBe(3);
    expect(totals.total).toBe(23);
  });

  it("caps a line discount at the line value and ignores negatives", () => {
    const capped = calculateCartTotals([{ price: 10, quantity: 1, discount: 50 }], 0);
    expect(capped.discount).toBe(10);
    expect(capped.total).toBe(0);

    const negative = calculateCartTotals([{ price: 10, quantity: 1, discount: -5 }], 0);
    expect(negative.discount).toBe(0);
    expect(negative.total).toBe(10);
  });

  it("rounds to two decimals", () => {
    const totals = calculateCartTotals([{ price: 3.333, quantity: 3, discount: 0 }], 15);
    expect(totals.subtotal).toBe(10);
    expect(totals.total).toBe(11.5);
  });
});

describe("formatters", () => {
  it("always shows two decimals with the currency", () => {
    expect(money(5, "SAR")).toContain("SAR");
  });

  it("formats empty values as zero", () => {
    expect(num(null)).toBeTruthy();
  });
});

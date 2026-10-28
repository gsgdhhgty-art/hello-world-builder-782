import { describe, expect, it } from "vitest";
import { matchesSupermarketFilter } from "./rules";
import type { CheckoutProduct } from "../shared/catalog";

const product: CheckoutProduct = {
  id: "p", name: "منتج", barcode: null, sku: null, price: 20, unit: "kg",
  track_stock: true, category_id: null, image_url: null, expires_at: null,
};
const now = new Date(2026, 9, 28);
describe("supermarket catalog rules", () => {
  it("uses the configured weighted-product flag rather than inferring it from a unit label", () => {
    expect(matchesSupermarketFilter(product, "weight", 5, 30, now)).toBe(false);
    expect(matchesSupermarketFilter({ ...product, sold_by_weight: true }, "weight", 5, 30, now)).toBe(true);
  });
  it("shows approaching expiry but never labels expired stock as approaching expiry", () => {
    expect(matchesSupermarketFilter({ ...product, expires_at: "2026-10-29" }, "soon", 5, 30, now)).toBe(true);
    expect(matchesSupermarketFilter({ ...product, expires_at: "2026-10-27" }, "soon", 5, 30, now)).toBe(false);
    expect(matchesSupermarketFilter({ ...product, expires_at: "2026-12-01" }, "soon", 5, 30, now)).toBe(false);
  });
  it("available filter excludes tracked zero stock and permits untracked services", () => {
    expect(matchesSupermarketFilter(product, "available", 0, 30, now)).toBe(false);
    expect(matchesSupermarketFilter(product, "available", 2, 30, now)).toBe(true);
    expect(matchesSupermarketFilter({ ...product, track_stock: false }, "available", 0, 30, now)).toBe(true);
  });
});
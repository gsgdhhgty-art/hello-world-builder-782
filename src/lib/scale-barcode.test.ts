import { describe, expect, it } from "vitest";
import { expiryState, matchesScaleCode, parseScaleBarcode } from "./scale-barcode";

function withCheck(d12: string) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return d12 + ((10 - (s % 10)) % 10);
}

describe("scale barcode", () => {
  it("reads weight in kg", () => {
    const r = parseScaleBarcode(withCheck("200012301250"), "2", "WEIGHT");
    expect(r).toEqual({ code: "123", value: 1.25, mode: "WEIGHT" });
    expect(matchesScaleCode({ barcode: "000123", sku: null }, r!.code)).toBe(true);
  });
  it("reads price and two-digit prefix", () => {
    expect(parseScaleBarcode(withCheck("210004504599"), "21", "PRICE")?.value).toBe(45.99);
  });
  it("rejects bad check digit or prefix", () => {
    expect(parseScaleBarcode("2000123012501", "2", "WEIGHT")?.value ?? null).not.toBe(9);
    expect(parseScaleBarcode(withCheck("300012301250"), "2", "WEIGHT")).toBeNull();
  });
  it("classifies expiry", () => {
    const now = new Date(2026, 8, 27);
    expect(expiryState("2026-09-26", 30, now)).toBe("expired");
    expect(expiryState("2026-10-10", 30, now)).toBe("soon");
    expect(expiryState("2027-01-01", 30, now)).toBe("ok");
    expect(expiryState(null, 30, now)).toBe("none");
  });
});

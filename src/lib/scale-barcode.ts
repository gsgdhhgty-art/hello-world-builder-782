export type ScaleMode = "WEIGHT" | "PRICE";

export interface ScaleBarcode {
  /** Product code (PLU) embedded by the scale, without leading zeros. */
  code: string;
  /** Weight in kg (WEIGHT mode) or line price (PRICE mode). */
  value: number;
  mode: ScaleMode;
}

function ean13CheckDigit(first12: string) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * Parses in-store EAN-13 labels printed by weighing scales:
 * prefix + product code (fills up to digit 7) + 5-digit value + check digit.
 * WEIGHT values are grams, PRICE values are hundredths of the currency.
 */
export function parseScaleBarcode(
  raw: string,
  prefix: string,
  mode: ScaleMode,
): ScaleBarcode | null {
  const value = raw.trim();
  if (!/^\d{13}$/.test(value) || !/^\d{1,2}$/.test(prefix) || !value.startsWith(prefix)) {
    return null;
  }
  if (ean13CheckDigit(value.slice(0, 12)) !== Number(value[12])) return null;
  const code = value.slice(prefix.length, 7).replace(/^0+/, "");
  const amount = Number(value.slice(7, 12));
  if (!code || amount <= 0) return null;
  return { code, value: mode === "WEIGHT" ? amount / 1000 : amount / 100, mode };
}

export function matchesScaleCode(
  product: { barcode: string | null; sku: string | null },
  code: string,
) {
  const strip = (v: string | null) => (v ?? "").trim().replace(/^0+/, "");
  return strip(product.barcode) === code || strip(product.sku) === code;
}

export type ExpiryState = "expired" | "soon" | "ok" | "none";

export function expiryState(
  expiresAt: string | null | undefined,
  alertDays: number,
  now = new Date(),
): ExpiryState {
  if (!expiresAt) return "none";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = expiresAt.slice(0, 10).split("-").map(Number);
  const exp = new Date(y!, m! - 1, d!).getTime();
  const days = Math.round((exp - today) / 86_400_000);
  if (days < 0) return "expired";
  if (days <= alertDays) return "soon";
  return "ok";
}

export function daysUntil(expiresAt: string, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = expiresAt.slice(0, 10).split("-").map(Number);
  return Math.round((new Date(y!, m! - 1, d!).getTime() - today) / 86_400_000);
}

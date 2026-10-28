import type { IndustryMeta } from "../types";
export const supermarket: IndustryMeta = {
  slug: "supermarket",
  name: "السوبر ماركت والبقالة",
  icon: "shopping-cart",
  theme: { primary: "#0F766E", accent: "#F59E0B" },
  defaultSettings: { expiry_alert_days: 30, block_expired_sales: true },
  features: ["barcode", "scale", "expiry", "stock_count"],
  pos: { mode: "retail", weight: true },
};

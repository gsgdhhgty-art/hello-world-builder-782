import type { IndustryMeta } from "../types";
export const pharmacy: IndustryMeta = {
  slug: "pharmacy",
  name: "الصيدليات",
  icon: "pill",
  theme: { primary: "#0E7490", accent: "#10B981" },
  defaultSettings: { expiry_alert_days: 90, block_expired_sales: true },
  features: ["barcode", "expiry", "batches", "stock_count"],
  pos: { mode: "retail", weight: false },
};

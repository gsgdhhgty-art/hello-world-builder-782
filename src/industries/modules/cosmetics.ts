import type { IndustryMeta } from "../types";
export const cosmetics: IndustryMeta = {
  slug: "cosmetics",
  name: "محلات العطور ومستحضرات التجميل",
  icon: "sparkles",
  theme: { primary: "#DB2777", accent: "#A855F7" },
  defaultSettings: { expiry_alert_days: 180, block_expired_sales: true },
  features: ["expiry", "batches", "catalog"],
  pos: { mode: "retail", weight: false },
};

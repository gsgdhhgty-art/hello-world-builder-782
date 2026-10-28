import type { IndustryMeta } from "../types";
export const autoParts: IndustryMeta = {
  slug: "auto-parts",
  name: "محلات قطع غيار السيارات",
  icon: "wrench",
  theme: { primary: "#374151", accent: "#EF4444" },
  defaultSettings: { expiry_alert_days: 0, block_expired_sales: false },
  features: ["fitment", "stock_count"],
  pos: { mode: "retail", weight: false },
};

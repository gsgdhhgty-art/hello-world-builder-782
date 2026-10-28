import type { IndustryMeta } from "../types";
export const bookstore: IndustryMeta = {
  slug: "bookstore",
  name: "المكتبات والأدوات المكتبية",
  icon: "book",
  theme: { primary: "#92400E", accent: "#D97706" },
  defaultSettings: { expiry_alert_days: 0, block_expired_sales: false },
  features: ["catalog", "stock_count"],
  pos: { mode: "retail", weight: false },
};

import type { IndustryMeta } from "../types";
export const homeGoods: IndustryMeta = {
  slug: "home-goods",
  name: "محلات الأدوات المنزلية",
  icon: "home",
  theme: { primary: "#CA8A04", accent: "#84CC16" },
  defaultSettings: { expiry_alert_days: 0, block_expired_sales: false },
  features: ["units", "stock_count"],
  pos: { mode: "retail", weight: false },
};

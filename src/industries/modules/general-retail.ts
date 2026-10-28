import type { IndustryMeta } from "../types";
export const generalRetail: IndustryMeta = {
  slug: "general-retail",
  name: "محلات البيع بالتجزئة العامة",
  icon: "store",
  theme: { primary: "#0E7490", accent: "#F59E0B" },
  defaultSettings: { expiry_alert_days: 0, block_expired_sales: false },
  features: ["barcode", "stock_count"],
  pos: { mode: "retail", weight: false },
};

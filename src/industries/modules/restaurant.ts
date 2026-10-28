import type { IndustryMeta } from "../types";
export const restaurant: IndustryMeta = {
  slug: "restaurant",
  name: "المطاعم",
  icon: "utensils",
  theme: { primary: "#B91C1C", accent: "#F59E0B" },
  defaultSettings: { expiry_alert_days: 14, block_expired_sales: false },
  features: ["tables", "modifiers", "kitchen_print", "delivery", "order_status"],
  pos: { mode: "tables", weight: false },
};

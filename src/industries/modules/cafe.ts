import type { IndustryMeta } from "../types";
export const cafe: IndustryMeta = {
  slug: "cafe",
  name: "الكافيهات والمقاهي",
  icon: "coffee",
  theme: { primary: "#B45309", accent: "#F97316" },
  defaultSettings: { expiry_alert_days: 14, block_expired_sales: false },
  features: ["tables", "modifiers", "kitchen_print", "order_status"],
  pos: { mode: "tables", weight: false },
};

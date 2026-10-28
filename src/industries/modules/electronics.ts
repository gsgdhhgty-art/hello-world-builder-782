import type { IndustryMeta } from "../types";
export const electronics: IndustryMeta = {
  slug: "electronics",
  name: "محلات الإلكترونيات والهواتف",
  icon: "smartphone",
  theme: { primary: "#1D4ED8", accent: "#06B6D4" },
  defaultSettings: { expiry_alert_days: 0, block_expired_sales: false },
  features: ["serial_tracking", "warranty", "imei"],
  pos: { mode: "serial", weight: false },
};

import type { IndustryMeta } from "../types";
export const clothing: IndustryMeta = {
  slug: "clothing",
  name: "محلات الملابس والأحذية",
  icon: "shirt",
  theme: { primary: "#7C3AED", accent: "#EC4899" },
  defaultSettings: { expiry_alert_days: 0, block_expired_sales: false },
  features: ["variants", "sizes", "colors", "exchange"],
  pos: { mode: "variants", weight: false },
};

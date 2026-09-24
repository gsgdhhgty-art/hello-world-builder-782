import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.smartpos",
  appName: "SmartPOS",
  webDir: "dist",
  android: {
    allowMixedContent: false,
  },
};

export default config;

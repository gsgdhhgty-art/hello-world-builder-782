import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.smartpos",
  appName: "SmartPOS",
  webDir: "dist/client",
  android: {
    allowMixedContent: false,
  },
};

export default config;

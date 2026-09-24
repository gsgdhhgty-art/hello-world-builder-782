import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.smartpos",
  appName: "SmartPOS",
  webDir: "public",
  server: {
    url: "https://project--2cdd9e5d-1351-4d1d-aac6-5f7d61c3fcf8.lovable.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ai.adaptive.aiassistant",
  appName: "AI Assistant",
  webDir: "www",
  server: {
    url: "https://ai-assistant-poreq51.adaptive.ai",
    androidScheme: "https",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;

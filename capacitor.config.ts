import type { CapacitorConfig } from "@capacitor/cli";

// Android packaging:  npm run build && npx cap add android && npm run cap:android
// In the native app there is no dev proxy, so set VITE_API_URL (see .env.example) before building.
const config: CapacitorConfig = {
  appId: "app.nasj.learning",
  appName: "NASJ",
  webDir: "dist",
  backgroundColor: "#FBF6EC",
  android: { allowMixedContent: false },
};

export default config;

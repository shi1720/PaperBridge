import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  timeout: 90000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5174",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5173",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_FIREBASE_API_KEY: "emulator-key",
        VITE_SERVICE_READY: "false",
      },
    },
    {
      command: "npm run dev -- --port 5174",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_USE_EMULATORS: "true",
        VITE_FIREBASE_API_KEY: "emulator-key",
        VITE_FIREBASE_PROJECT_ID: "demo-paperbridge",
        VITE_FIREBASE_STORAGE_BUCKET: "demo-paperbridge.appspot.com",
        VITE_FIREBASE_AUTH_DOMAIN: "demo-paperbridge.firebaseapp.com",
        VITE_FIREBASE_AUTH_TENANT_ID: "",
        VITE_API_FUNCTION_NAME: "paperbridgeApi",
        VITE_UPLOAD_FUNCTION_NAME: "paperbridgeUploadManuscript",
        VITE_UPLOAD_URL: "",
      },
    },
  ],
  reporter: [["list"], ["html", { open: "never" }]],
});

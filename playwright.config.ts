import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  webServer: { command: "npm run dev", url: "http://127.0.0.1:5173", reuseExistingServer: true },
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit-desktop", use: { ...devices["Desktop Safari"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] } },
    { name: "android-chromium", use: { ...devices["Pixel 7"] } },
  ],
});

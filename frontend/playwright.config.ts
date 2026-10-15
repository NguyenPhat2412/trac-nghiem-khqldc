import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "../work/browser-results",
  use: {
    baseURL: "http://localhost:3000",
    channel: "chrome",
    viewport: { width: 1505, height: 1045 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});

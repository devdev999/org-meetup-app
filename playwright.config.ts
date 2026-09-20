import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: "http://127.0.0.1:3011",
    timezoneId: "UTC",
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node .next/standalone/server.js",
    url: "http://127.0.0.1:3011/sign-in",
    env: { PORT: "3011", HOSTNAME: "127.0.0.1" },
    reuseExistingServer: false,
  },
});

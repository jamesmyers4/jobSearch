import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/email",
  fullyParallel: true,
  reporter: "list",
  use: {
    // No baseURL/webServer here on purpose — these tests render generated
    // HTML strings directly via page.setContent(), they never navigate to
    // a live server, because jobSearch doesn't run one.
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

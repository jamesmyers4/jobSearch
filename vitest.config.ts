import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      RESEND_API_KEY: "re_test_dummy_key_for_unit_tests",
    },
    include: ["tests/unit/**/*.test.ts", "tests/fetchers/**/*.test.ts", "tests/state/**/*.test.ts", "tests/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["check-jobs.ts"],
    },
  },
});

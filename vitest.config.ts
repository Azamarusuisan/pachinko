import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts", "tools/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    pool: "forks",
    maxWorkers: 1,
  },
});

import { defineConfig } from "vitest/config";

// API tests run against the local Supabase started by `supabase start` (database,
// Auth and Storage); the training schema is re-created at the start of every run.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      SITE_ORIGINS: "http://localhost:8080",
    },
  },
});

import { defineConfig } from "vitest/config";

// pglite migrates the TFDA seed in each test DB; allow for slow parallel runs.
export default defineConfig({
  test: { testTimeout: 20000, hookTimeout: 20000 },
});

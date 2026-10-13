import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests for PURE logic only (risk, recovery state machine, challenge generation...).
// Keep tested modules free of db/env/next imports so tests need no setup.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/server-only.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});

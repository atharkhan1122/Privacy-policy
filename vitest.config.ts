import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    // .tsx component tests opt into a DOM via a per-file
    // `// @vitest-environment happy-dom` docblock; everything else stays on node.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // pglite (in-process Postgres) boots a WASM engine per test; give the
    // Postgres-backed suite headroom over the 5s default so it isn't flaky.
    testTimeout: 30_000,
  },
});

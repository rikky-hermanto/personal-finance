import { defineConfig } from "vitest/config";
import path from "path";

// Scoped narrowly to src/lib/desk (PF-133) — Vitest is not yet configured repo-wide (PF-038).
// Run via `npm run test:desk`, which passes `src/lib/desk` explicitly; do not widen this config's
// scope to the rest of the app without going through PF-038 first.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});

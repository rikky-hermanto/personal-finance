import { defineConfig } from "vitest/config";
import path from "path";

// Unit tests cover pure logic in src/lib only. Component tests are not set up yet (PF-038), and
// e2e/ holds Playwright specs, which must never be collected by Vitest.
// `npm run test:coverage` runs every src/lib suite once and reports coverage over all of src/,
// so untested pages and components show up as 0% rather than being hidden.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**", "e2e/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**", "src/components/ui/**", "src/**/*.d.ts"],
      // json feeds scripts/coverage-report.mjs; html is for browsing coverage/index.html.
      reporter: ["text-summary", "json", "html"],
      reportsDirectory: "coverage",
    },
  },
});

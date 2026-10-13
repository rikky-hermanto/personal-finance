import { defineConfig, devices } from '@playwright/test';

// Disposable PF-S08 harness only. Keep it separate from the normal E2E server.
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  reporter: 'line',
  timeout: 120_000,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8088',
    actionTimeout: 15_000,
  },
  expect: { timeout: 15_000 },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 8088 --strictPort',
    url: 'http://127.0.0.1:8088',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

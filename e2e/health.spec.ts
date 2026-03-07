import { test, expect } from '@playwright/test';

const API_URL = 'http://localhost:7208';

test('health check returns Healthy', async ({ request }) => {
  const res = await request.get(`${API_URL}/api/transactions/health`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('Healthy');
});

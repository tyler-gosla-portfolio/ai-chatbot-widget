import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'tests/e2e/results.json' }]],
  use: {
    baseURL: 'http://localhost:4567',
    headless: true,
    video: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node tests/e2e/testServer.mjs',
    url: 'http://localhost:4567/health',
    reuseExistingServer: false,
    timeout: 30000,
    env: {
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'sk-test-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars-long!!',
      ADMIN_EMAIL: 'admin@test.com',
      ADMIN_PASSWORD: 'testpassword123',
      DB_PATH: ':memory:',
      PORT: '4567',
      LOG_LEVEL: 'error',
      E2E_TEST_MODE: 'true',
    },
  },
});

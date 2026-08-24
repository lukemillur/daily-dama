import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 30000,
  testDir: 'e2e/auth',
  reporter: 'list',
  use: { baseURL: 'http://localhost:8081', trace: 'retain-on-failure' },
  webServer: { command: 'yarn expo start --web --port 8081', url: 'http://localhost:8081', reuseExistingServer: false, timeout: 120000 },
  projects: [ { name: 'authConfigured', use: devices['Desktop Chrome'] } ],
});

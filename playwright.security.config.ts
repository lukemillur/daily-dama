import { defineConfig, devices } from "@playwright/test";

// T162.1: the report-only CSP suite runs against a production-like static export
// (built and served exactly like Vercel would -- see security/scripts/build-and-serve.mjs),
// not the Expo dev server, since the CSP is a served-header/static-export concern.
export default defineConfig({
  workers: 1,
  retries: 0,
  fullyParallel: false,
  timeout: 30000,
  testDir: "e2e/security",
  reporter: "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  webServer: {
    command: "node security/scripts/build-and-serve.mjs --port=4173",
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120000,
  },
  projects: [{ name: "security", use: devices["Desktop Chrome"] }],
});

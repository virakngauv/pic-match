import { defineConfig, devices } from '@playwright/test'

const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL
const baseURL = remoteBaseURL ?? 'http://127.0.0.1:3100'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 3,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, workers: 1 },
  ],
  webServer: remoteBaseURL
    ? undefined
    : {
        command:
          'cross-env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= pnpm dev:e2e',
        url: baseURL,
        reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
        timeout: 120_000,
      },
})

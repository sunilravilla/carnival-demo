import { defineConfig, devices } from '@playwright/test';

// Wave 3 E2E config — runs against the LIVE dev servers we already have up
// (vite :5173 + uvicorn :8000). Single worker because the backend's ship_data
// is module-global and tests would race on reservation state.
export default defineConfig({
  testDir: './tests/e2e',
  // Each test contains real LLM-backed agent calls; budget generously.
  timeout: 90_000,
  // Most specs run a few-turn chat flow. Keep a single worker so the shared
  // backend isn't trampled by parallel sessions.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
  ],
  use: {
    baseURL: process.env.WEB_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Mobile-ish viewport — this app ships as a PWA optimized for phones.
    viewport: { width: 414, height: 896 },
    // Pretend we're not in an automated browser when chatting — the agent
    // doesn't care, but it makes manual debugging cleaner.
    locale: 'en-US',
    timezoneId: 'America/New_York',
  },
  projects: [
    {
      name: 'chromium-mobile',
      use: {
        // Pixel 7 is a chromium-based mobile profile (iPhone uses webkit
        // which we deliberately don't install — saves ~120 MB of browser).
        ...devices['Pixel 7'],
        colorScheme: 'light',
      },
    },
  ],
});

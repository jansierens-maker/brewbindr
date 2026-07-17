import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Laad .env.test lokaal; in CI komen vars via GitHub Secrets
// dotenv.config({ path: '.env.test' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    // Gebruik PLAYWRIGHT_BASE_URL in CI (Vercel preview/prod URL),
    // lokaal valt het terug op de dev server
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? {
          'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
        }
      : {},
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Lokaal: start de Vite dev server automatisch
  // In CI: de app draait al op PLAYWRIGHT_BASE_URL, dus geen webServer nodig
  ...(process.env.CI
    ? {}
    : {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:5173',
          reuseExistingServer: true,
          timeout: 30000,
        },
      }),
});

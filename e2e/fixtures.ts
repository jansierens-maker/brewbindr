import { test as base, expect } from '@playwright/test';

// Same as Playwright's `test`, but browser errors are written to the test output,
// so a failing run in CI shows what went wrong inside the app.
export const test = base.extend({
  page: async ({ page }, use) => {
    page.on('pageerror', err => console.log(`[pageerror] ${err.message}`));
    page.on('console', msg => { if (msg.type() === 'error') console.log(`[console.error] ${msg.text()}`); });
    page.on('requestfailed', req => console.log(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`));
    await use(page);
  },
});

export { expect };

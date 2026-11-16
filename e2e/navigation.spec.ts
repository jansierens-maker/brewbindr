import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// Read-only: runs as a guest, so it is safe against production as well.
const HELP_TITLE = /help & (manuals|handleidingen|manuels)/i;

async function dismissConnectionDetails(page: Page) {
  // Guests may see the 'Connection Details' modal; close it if it shows up
  const closeBtn = page.getByRole('button', { name: /close/i }).last();
  try {
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
  } catch {
    // Not shown
  }
}

test.describe('URLs per screen', () => {
  test('a link to a screen opens that screen, also after a refresh', async ({ page }) => {
    await page.goto('/help');
    await page.waitForLoadState('networkidle');
    await dismissConnectionDetails(page);
    await expect(page.locator('main h2').getByText(HELP_TITLE)).toBeVisible();
    await expect(page).toHaveURL(/\/help$/);

    await page.reload();
    await page.waitForLoadState('networkidle');
    await dismissConnectionDetails(page);
    await expect(page.locator('main h2').getByText(HELP_TITLE)).toBeVisible();
  });

  test('the back button returns to the previous screen', async ({ page }) => {
    await page.goto('/library/styles');
    await page.waitForLoadState('networkidle');
    await dismissConnectionDetails(page);

    await page.getByRole('button', { name: /help/i }).first().click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.locator('main h2').getByText(HELP_TITLE)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/library\/styles$/);
    await expect(page.locator('main h2').getByText(HELP_TITLE)).toHaveCount(0);

    await page.goForward();
    await expect(page).toHaveURL(/\/help$/);
  });

  test('a guest on a link to a screen that needs signing in gets the public recipes', async ({ page }) => {
    await page.goto('/team');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/library\/recipes$/);
  });

  test('a screen that needs a recipe chosen first falls back to its list', async ({ page }) => {
    await page.goto('/tasting');
    await page.waitForLoadState('networkidle');
    // Guests cannot open the tasting notes either, so they end on the public recipes
    await expect(page).not.toHaveURL(/\/tasting$/);
  });
});

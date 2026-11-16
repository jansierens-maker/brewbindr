import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// Read-only, so safe against production as well.
const HELP_TITLE = /help & (manuals|handleidingen|manuels)/i;

const TEST_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD!;
// Labels in en / nl / fr (see services/i18n.ts)
const SIGN_IN = /^(sign in|aanmelden|se connecter)$/i;
const EMAIL = /e-?mail/i;
const PASSWORD = /password|wachtwoord|mot de passe/i;
const EDIT_OR_VIEW = /^(edit|bewerken|modifier|view|bekijken|voir)$/i;
const UUID = '[0-9a-f-]{36}';

async function login(page: Page) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: SIGN_IN }).first().click();
  const form = page.locator('form');
  await form.getByRole('textbox', { name: EMAIL }).fill(TEST_EMAIL);
  await form.getByLabel(PASSWORD).fill(TEST_PASSWORD);
  await form.getByRole('button', { name: SIGN_IN }).click();
  await expect(page.getByRole('button', { name: SIGN_IN })).toHaveCount(0, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

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

  test('a link to a recipe that does not exist (or is not visible) falls back to the list', async ({ page }) => {
    await page.goto('/library/recipes/00000000-0000-4000-8000-000000000000');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/library\/recipes$/);
  });

  test('a guest on a link to a brew gets the public recipes', async ({ page }) => {
    await page.goto('/brews/00000000-0000-4000-8000-000000000000/tasting');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/library\/recipes$/);
  });
});

test('a guest on the start page gets the public recipes without an extra history step', async ({ page }) => {
  await page.goto('/help');
  await page.waitForLoadState('networkidle');
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/library\/recipes$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/help$/);
});

test('a recipe keeps its URL after a refresh, and back returns to the list', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);
  await page.goto('/recipes');
  await page.waitForLoadState('networkidle');
  const open = page.getByRole('button', { name: EDIT_OR_VIEW }).first();
  if (await open.count() === 0) test.skip(true, 'The test account has no recipes');
  await open.click();

  await expect(page).toHaveURL(new RegExp(`/recipes/${UUID}$`));
  const url = page.url();
  const name = await page.locator('#recipe_name').inputValue();

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(url);
  await expect(page.locator('#recipe_name')).toHaveValue(name, { timeout: 15000 });

  await page.goBack();
  await expect(page).toHaveURL(/\/recipes$/);
});

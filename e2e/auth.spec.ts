import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD!;

// Labels in en / nl / fr (see services/i18n.ts)
const SIGN_IN = /^(sign in|aanmelden|se connecter)$/i;
const EMAIL = /e-?mail/i;
const PASSWORD = /password|wachtwoord|mot de passe/i;

// Guests land on the public recipe library; the login form opens via the
// "Sign in" button in the top bar (the sidebar has one too, hence .first()).
async function openLoginForm(page: Page) {
  await page.getByRole('button', { name: SIGN_IN }).first().click();
  await expect(page.locator('form').getByRole('textbox', { name: EMAIL })).toBeVisible({ timeout: 15000 });
}

async function submitLogin(page: Page, email: string, password: string) {
  const form = page.locator('form');
  await form.getByRole('textbox', { name: EMAIL }).fill(email);
  await form.getByLabel(PASSWORD).fill(password);
  await form.getByRole('button', { name: SIGN_IN }).click();
}

async function expectLoggedIn(page: Page) {
  // Once signed in, the guest "Sign in" buttons disappear
  await expect(page.getByRole('button', { name: SIGN_IN })).toHaveCount(0, { timeout: 15000 });
}

test.describe('Auth / Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // The app runs a Supabase health check on load and then resets the view to
    // the recipe list; wait for it so it can't close the login form mid-test.
    await page.waitForLoadState('networkidle');
  });

  test('toont de loginpagina voor niet-ingelogde gebruikers', async ({ page }) => {
    await openLoginForm(page);
    await expect(page.locator('form').getByLabel(PASSWORD)).toBeVisible();
  });

  test('kan inloggen met geldige credentials', async ({ page }) => {
    await openLoginForm(page);
    await submitLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await expectLoggedIn(page);
  });

  test('toont foutmelding bij verkeerde credentials', async ({ page }) => {
    await openLoginForm(page);
    await submitLogin(page, TEST_EMAIL, 'fout-wachtwoord-123!');

    // Supabase returns "Invalid login credentials"
    await expect(page.getByText(/ongeldig|invalid|incorrect|onjuist/i)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('form').getByRole('textbox', { name: EMAIL })).toBeVisible();
  });

  test('kan uitloggen na inloggen', async ({ page }) => {
    await openLoginForm(page);
    await submitLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await expectLoggedIn(page);

    // Sign out lives on the Settings page. Locate both buttons by their icon,
    // so the test works whatever language the test user has selected.
    await page.locator('aside button:has(i.fa-gear)').click();
    await page.locator('button:has(i.fa-sign-out-alt)').click();

    // Back to guest mode: the "Sign in" button is shown again
    await expect(page.getByRole('button', { name: SIGN_IN }).first()).toBeVisible({ timeout: 15000 });
  });
});

test.describe('Navigatie blijft staan', () => {
  test('loginformulier blijft open als je meteen op Aanmelden klikt', async ({ page }) => {
    // Beantwoord de databaseaanvragen traag en leeg (zoals bij een trage
    // verbinding), zodat de opstartcontrole pas slaagt NADAT er op Aanmelden
    // geklikt is. Vroeger zette die controle het scherm dan terug naar de
    // receptenlijst. Dit test enkel navigatie, niet de data.
    await page.route('**/rest/v1/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 2500));
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto('/');
    await openLoginForm(page);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('form').getByRole('textbox', { name: EMAIL })).toBeVisible();
  });

  test('kan uitloggen via het gebruikersmenu in de zijbalk', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await openLoginForm(page);
    await submitLogin(page, TEST_EMAIL, TEST_PASSWORD);
    await expectLoggedIn(page);

    await page.locator('aside button[aria-haspopup="menu"]').click();
    await page.getByRole('menuitem', { name: /sign out|uitloggen|déconnexion/i }).click();

    await expect(page.getByRole('button', { name: SIGN_IN }).first()).toBeVisible({ timeout: 15000 });
  });
});

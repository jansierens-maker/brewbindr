import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD!;

test.describe('Auth / Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('toont de loginpagina voor niet-ingelogde gebruikers', async ({ page }) => {
    // Verwacht dat de login/auth pagina zichtbaar is
    await expect(page).toHaveURL(/\/(login|auth|sign-in)?$/);
    await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /wachtwoord|password/i })).toBeVisible();
  });

  test('kan inloggen met geldige credentials', async ({ page }) => {
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: /wachtwoord|password/i }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /inlog|sign.?in|login/i }).click();

    // Na login: verwacht redirect naar dashboard of home
    await expect(page).not.toHaveURL(/\/(login|auth|sign-in)/);
    // Controleer dat er iets van de app zichtbaar is (pas selector aan indien nodig)
    await expect(page.getByRole('navigation')).toBeVisible({ timeout: 10000 });
  });

  test('toont foutmelding bij verkeerde credentials', async ({ page }) => {
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: /wachtwoord|password/i }).fill('fout-wachtwoord-123!');
    await page.getByRole('button', { name: /inlog|sign.?in|login/i }).click();

    // Verwacht een foutmelding
    await expect(
      page.getByText(/ongeldig|invalid|incorrect|fout|onjuist/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('kan uitloggen na inloggen', async ({ page }) => {
    // Login
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: /wachtwoord|password/i }).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /inlog|sign.?in|login/i }).click();
    await expect(page).not.toHaveURL(/\/(login|auth|sign-in)/, { timeout: 10000 });

    // Logout — pas selector aan op jouw UI
    await page.getByRole('button', { name: /uitlog|sign.?out|logout/i }).click();

    // Verwacht terug op loginpagina
    await expect(page).toHaveURL(/\/(login|auth|sign-in)?$/);
  });
});

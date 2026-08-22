import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD!;

test.describe('Auth / Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Guest users (no Supabase configured) may see a "Connection Details"
    // modal on load; dismiss it so it doesn't intercept later clicks.
    const closeBtn = page.getByRole('button', { name: /close/i }).last();
    try {
      await expect(closeBtn).toBeVisible({ timeout: 5000 });
      await closeBtn.click();
      await expect(closeBtn).not.toBeVisible();
    } catch (e) {
      // Modal didn't show up, which is fine
    }

    // This SPA has no separate /login route: guest users land on the Public
    // Library view and the Auth form only mounts after clicking "Sign In".
    const signInBtn = page.getByRole('button', { name: /sign.?in|aanmelden/i }).first();
    if (await signInBtn.isVisible().catch(() => false)) {
      await signInBtn.click();
    }
  });

  test('toont de loginpagina voor niet-ingelogde gebruikers', async ({ page }) => {
    // Verwacht dat de login/auth pagina zichtbaar is
    // Note: Vercel deployment protection can intercept this, however by passing the automation bypass secret we ensure we hit our app.
    // Either it redirects to /login (or /auth or /sign-in) or it stays on root if not logged in.
    await expect(page).toHaveURL(/(\/(login|auth|sign-in)|\/$)/);

    await expect(page.getByRole('textbox', { name: /e-?mail/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('textbox', { name: /wachtwoord|password/i })).toBeVisible({ timeout: 15000 });
  });

  test('kan inloggen met geldige credentials', async ({ page }) => {
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: /wachtwoord|password/i }).fill(TEST_PASSWORD);
    // Scoped to <main>: the sidebar also has a "Sign In" nav CTA with the
    // same accessible name as the Auth form's actual submit button.
    await page.locator('main').getByRole('button', { name: /inlog|sign.?in|login/i }).click();

    // Na login: verwacht redirect naar dashboard of home
    await expect(page).not.toHaveURL(/\/(login|auth|sign-in)/);
    // Controleer dat er iets van de app zichtbaar is. De sidebar heeft
    // meerdere <nav>'s (een per sectie), dus .first() volstaat hier.
    await expect(page.getByRole('navigation').first()).toBeVisible({ timeout: 10000 });
  });

  test('toont foutmelding bij verkeerde credentials', async ({ page }) => {
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: /wachtwoord|password/i }).fill('fout-wachtwoord-123!');
    // Scoped to <main>: the sidebar also has a "Sign In" nav CTA with the
    // same accessible name as the Auth form's actual submit button.
    await page.locator('main').getByRole('button', { name: /inlog|sign.?in|login/i }).click();

    // Verwacht een foutmelding
    await expect(
      page.getByText(/ongeldig|invalid|incorrect|fout|onjuist/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test('kan uitloggen na inloggen', async ({ page }) => {
    // Login
    await page.getByRole('textbox', { name: /e-?mail/i }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: /wachtwoord|password/i }).fill(TEST_PASSWORD);
    // Scoped to <main>: the sidebar also has a "Sign In" nav CTA with the
    // same accessible name as the Auth form's actual submit button.
    await page.locator('main').getByRole('button', { name: /inlog|sign.?in|login/i }).click();
    await expect(page).not.toHaveURL(/\/(login|auth|sign-in)/, { timeout: 10000 });

    // Logout: the sign-out button lives in the Settings view, not on the
    // dashboard, so navigate there first via the sidebar nav item. The
    // Vercel preview can be slow to settle right after a fresh login
    // (cold serverless functions), so wait explicitly for the nav button
    // to be actionable instead of a bare .click() with no diagnosable
    // call-log if it hangs.
    const settingsNavBtn = page.getByRole('button', { name: /settings|instellingen|paramètres/i }).first();
    await expect(settingsNavBtn).toBeVisible({ timeout: 20000 });
    await settingsNavBtn.click();

    const signOutBtn = page.getByRole('button', { name: /uitlog|sign.?out|logout|déconnexion/i });
    await expect(signOutBtn).toBeVisible({ timeout: 20000 });
    await signOutBtn.click();

    // This SPA has no dedicated /login route, so verify the guest state
    // (the Sign In CTA) is back instead of asserting on a URL change.
    await expect(page.getByRole('button', { name: /sign.?in|aanmelden/i }).first()).toBeVisible({ timeout: 10000 });
  });
});
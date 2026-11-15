import { test, expect } from './fixtures';
import { type Page, type Dialog } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD!;

// Labels in en / nl / fr (see services/i18n.ts)
const SIGN_IN = /^(sign in|aanmelden|se connecter)$/i;
const EMAIL = /e-?mail/i;
const PASSWORD = /password|wachtwoord|mot de passe/i;
const SAVE_RECIPE = /^(save recipe|recept opslaan|enregistrer)$/i;
const EDIT = /^(edit|bewerken|modifier)$/i;
const DELETE_RECIPE = /^(delete recipe|recept verwijderen|supprimer la recette)$/i;
const TO_LAB = /^(to lab|naar lab|vers labo)$/i;
const TO_REJECTED = /^(to rejected|naar afgekeurd|vers rejetée)$/i;
const ARCHIVE = /^(archive|archief|archives)\s*\d*$/i;
const IDEA = /^(idea|idee|idée)$/i;
const LAB = /^(lab|labo)$/i;
const REJECTED = /^(rejected|afgekeurd|rejetée)$/i;

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

const recipeCard = (page: Page, name: string) =>
  page.locator('div.group.relative', { has: page.getByRole('heading', { name, exact: true }) });
const panel = (page: Page) => page.locator('section[aria-labelledby="lifecycle-title"]');

test.describe('Levenscyclus', () => {
  // Writes data: runs on previews (staging database), not on production
  test('nieuw recept is een idee, gaat naar lab en wordt afgekeurd met een reden', { tag: '@writes' }, async ({ page }) => {
    test.setTimeout(90000);
    const name = `E2E levenscyclus ${Date.now()}`;
    page.on('dialog', async (dialog: Dialog) => { await dialog.accept(); });

    await login(page);
    try {
      await page.locator('header button:has(i.fa-plus)').click();
      await page.locator('#recipe_name').fill(name);
      await page.getByRole('button', { name: SAVE_RECIPE }).click();
      await expect(recipeCard(page, name)).toHaveCount(1, { timeout: 15000 });
      await expect(recipeCard(page, name).getByText(IDEA)).toBeVisible();

      // Idea → lab
      await recipeCard(page, name).first().getByRole('button', { name: EDIT }).click();
      await panel(page).getByRole('button', { name: TO_LAB }).first().click();
      await panel(page).locator('#lifecycle-note').locator('..').getByRole('button', { name: TO_LAB }).click();
      await expect(panel(page).getByText(LAB).first()).toBeVisible({ timeout: 15000 });

      // Lab → rejected needs a reason
      await panel(page).getByRole('button', { name: TO_REJECTED }).first().click();
      const confirmBtn = panel(page).locator('#lifecycle-note').locator('..').getByRole('button', { name: TO_REJECTED });
      await expect(confirmBtn).toBeDisabled();
      await panel(page).locator('#lifecycle-note').fill('E2E: te zoet');
      await confirmBtn.click();
      await expect(panel(page).getByText(REJECTED).first()).toBeVisible({ timeout: 15000 });

      // Gone from the active list, shown in the archive
      await page.locator('aside button:has(i.fa-flask)').first().click();
      await expect(recipeCard(page, name)).toHaveCount(0, { timeout: 15000 });
      await page.getByRole('button', { name: ARCHIVE }).click();
      await expect(recipeCard(page, name)).toHaveCount(1, { timeout: 15000 });
    } finally {
      await page.locator('aside button:has(i.fa-flask)').first().click();
      await page.getByRole('button', { name: ARCHIVE }).click().catch(() => {});
      const card = recipeCard(page, name);
      if (await card.count() > 0) {
        await card.first().getByRole('button', { name: EDIT }).click();
        await page.getByRole('button', { name: DELETE_RECIPE }).click();
        await expect(recipeCard(page, name)).toHaveCount(0, { timeout: 15000 });
      }
    }
  });
});

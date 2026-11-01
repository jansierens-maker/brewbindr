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
const NAME_TAKEN = /already has a recipe named|heeft al een recept|a déjà une recette nommée/i;

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

async function createRecipe(page: Page, name: string) {
  // "New" button in the top bar (shown on your own recipe list)
  await page.locator('header button:has(i.fa-plus)').click();
  await page.locator('#recipe_name').fill(name);
  await page.getByRole('button', { name: SAVE_RECIPE }).click();
}

const recipeCard = (page: Page, name: string) =>
  page.locator('div.group.relative', { has: page.getByRole('heading', { name, exact: true }) });

async function deleteRecipe(page: Page, name: string) {
  const card = recipeCard(page, name);
  if (await card.count() === 0) return;
  await card.first().getByRole('button', { name: EDIT }).click();
  await page.getByRole('button', { name: DELETE_RECIPE }).click(); // confirm() is accepted by the dialog handler
  await expect(recipeCard(page, name)).toHaveCount(0, { timeout: 15000 });
}

test.describe('Recepten', () => {
  test('recept aanmaken, dubbele naam geweigerd, recept verwijderen', async ({ page }) => {
    // Unique per run; the recipe is removed again at the end
    const name = `E2E test ${Date.now()}`;
    const dialogs: string[] = [];
    page.on('dialog', async (dialog: Dialog) => {
      dialogs.push(dialog.message());
      await dialog.accept();
    });

    await login(page);
    try {
      // 1. Create: the recipe shows up in the list
      await createRecipe(page, name);
      await expect(recipeCard(page, name)).toHaveCount(1, { timeout: 15000 });

      // 2. Same name again (other case/spaces) is refused and the editor stays open
      await createRecipe(page, `  ${name.toUpperCase()} `);
      await expect.poll(() => dialogs.some(m => NAME_TAKEN.test(m))).toBe(true);
      await expect(page.getByRole('button', { name: SAVE_RECIPE })).toBeVisible();

      // Leave the editor without saving: back to the recipe list
      await page.locator('aside button:has(i.fa-flask)').first().click();
      await expect(recipeCard(page, name)).toHaveCount(1);
    } finally {
      // 3. Clean up
      await deleteRecipe(page, name);
    }
  });
});

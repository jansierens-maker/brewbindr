import { test, expect } from './fixtures';
import { type Page, type Dialog } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL!;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD!;

// Labels in en / nl / fr (see services/i18n.ts)
const SIGN_IN = /^(sign in|aanmelden|se connecter)$/i;
const EMAIL = /e-?mail/i;
const PASSWORD = /password|wachtwoord|mot de passe/i;
const EDIT = /^(edit|bewerken|modifier)$/i;
const DELETE_RECIPE = /^(delete recipe|recept verwijderen|supprimer la recette)$/i;
const OPEN_FL = /^(open in flavour lab|ouvrir dans flavour lab)$/i;
const SPICES = /^(spices|kruiden|épices)$/i;
const ADD = /^(add to recipe|toevoegen aan recept|ajouter à la recette)$/i;
const CORIANDER = /^(coriander|koriander|coriandre)$/i;

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

// AC-01: a witbier with Hallertau at the end of the boil and a Belgian wit yeast
const witXml = (name: string) => `<?xml version="1.0" encoding="UTF-8"?>
<RECIPES>
  <RECIPE>
    <NAME>${name}</NAME>
    <TYPE>All Grain</TYPE>
    <BATCH_SIZE>20</BATCH_SIZE>
    <BOIL_TIME>60</BOIL_TIME>
    <EFFICIENCY>75</EFFICIENCY>
    <FERMENTABLES>
      <FERMENTABLE><NAME>Pilsner Malt</NAME><TYPE>Grain</TYPE><AMOUNT>2.5</AMOUNT><COLOR>2</COLOR></FERMENTABLE>
      <FERMENTABLE><NAME>Wheat Malt</NAME><TYPE>Grain</TYPE><AMOUNT>2</AMOUNT><COLOR>2</COLOR></FERMENTABLE>
    </FERMENTABLES>
    <HOPS>
      <HOP><NAME>Magnum</NAME><ALPHA>12</ALPHA><AMOUNT>0.012</AMOUNT><USE>Boil</USE><TIME>60</TIME></HOP>
      <HOP><NAME>Hallertauer MF</NAME><ALPHA>4</ALPHA><AMOUNT>0.025</AMOUNT><USE>Boil</USE><TIME>0</TIME></HOP>
    </HOPS>
    <YEASTS><YEAST><NAME>LalBrew Wit</NAME><TYPE>Ale</TYPE><FORM>Dry</FORM><AMOUNT>0.011</AMOUNT></YEAST></YEASTS>
  </RECIPE>
</RECIPES>`;

test.describe('Flavour Lab', () => {
  // Writes data: runs on previews (staging database), not on production
  test('witbier: koriander voorgesteld en toegevoegd aan het recept', { tag: '@writes' }, async ({ page }) => {
    test.setTimeout(90000);
    const name = `E2E flavour ${Date.now()}`;
    page.on('dialog', async (dialog: Dialog) => { console.log(`[dialog] ${dialog.message()}`); await dialog.accept(); });

    await login(page);
    try {
      await page.locator('aside button:has(i.fa-arrow-up-from-bracket)').first().click();
      await page.locator('#xml-file-import-view').setInputFiles({ name: 'wit.xml', mimeType: 'text/xml', buffer: Buffer.from(witXml(name)) });
      // Ingredients that exist already but were changed by hand: keep the existing ones
      const skip = page.getByRole('button', { name: /^(skip|overslaan|ignorer)$/i });
      await page.waitForTimeout(2000);
      while (await skip.count() > 0) { await skip.first().click(); await page.waitForTimeout(1000); }
      await page.getByRole('button', { name: /^(close|sluiten|fermer)$/i }).click({ timeout: 15000 });

      // Flow A: open the recipe in Flavour Lab from the recipe editor
      await page.locator('aside button:has(i.fa-flask)').first().click();
      await expect(recipeCard(page, name)).toHaveCount(1, { timeout: 15000 });
      await recipeCard(page, name).first().getByRole('button', { name: EDIT }).click();
      await page.getByRole('button', { name: OPEN_FL }).click();
      await expect(page.locator('#fl-recipe')).toBeVisible({ timeout: 15000 });
      await expect.poll(() => page.locator('#fl-recipe').evaluate((e: HTMLSelectElement) => e.options[e.selectedIndex]?.text ?? '')).toBe(name);

      // Profile and the spice tab: coriander among the top 3, with linalool as bridge
      await expect(page.locator('#fl-profile-title')).toBeVisible();
      await page.getByRole('tab', { name: SPICES }).click();
      const cards = page.locator('[role=tabpanel] > ul > li');
      const coriander = cards.filter({ has: page.getByRole('heading', { name: CORIANDER }) });
      await expect(coriander).toHaveCount(1, { timeout: 15000 });
      const rank = await cards.evaluateAll((els) => els.findIndex(el => /coriand|korian/i.test(el.querySelector('h4')?.textContent ?? '')));
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(rank).toBeLessThan(3);
      // Bridge chips read "linalool" plus a hidden descriptor for screen readers
      await expect(coriander.locator('li').filter({ hasText: /^linalool\b/ })).toHaveCount(1);

      // Add to recipe: stored, and no longer suggested
      await coriander.getByRole('button', { name: ADD }).click();
      // Shown when stored ("… is now in …")
      await expect(page.locator('main [role=status]').filter({ hasText: name })).toHaveCount(1, { timeout: 15000 })
        .catch(async (e) => { console.log('[flavour-lab] status:', await page.locator('main [role=status]').allInnerTexts()); throw e; });
      await expect(cards.filter({ has: page.getByRole('heading', { name: CORIANDER }) })).toHaveCount(0, { timeout: 15000 });

      // The recipe now holds the spice as MISC
      await page.locator('aside button:has(i.fa-flask)').first().click();
      await recipeCard(page, name).first().getByRole('button', { name: EDIT }).click();
      const miscNames = () => page.locator('select[id^="misc-select-"]').evaluateAll((els) =>
        (els as HTMLSelectElement[]).map(e => e.options[e.selectedIndex]?.text ?? ''));
      await expect.poll(miscNames, { timeout: 15000 }).toContainEqual(expect.stringMatching(CORIANDER));
      await page.locator('aside button:has(i.fa-flask)').first().click();
    } finally {
      const card = recipeCard(page, name);
      if (await card.count() > 0) {
        await card.first().getByRole('button', { name: EDIT }).click();
        await page.getByRole('button', { name: DELETE_RECIPE }).click();
        await expect(recipeCard(page, name)).toHaveCount(0, { timeout: 15000 });
      }
    }
  });
});

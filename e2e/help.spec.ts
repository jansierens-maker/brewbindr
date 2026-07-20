import { test, expect } from '@playwright/test';

test.describe('Help & Manuals', () => {
  test.beforeEach(async ({ page }) => {
    // Start by going to the main page
    await page.goto('/');

    // Wait for the app to load
    await page.waitForLoadState('networkidle');

    // Guest users might see the 'Connection Details' modal, dismiss it if it exists
    // We wait for it to potentially appear
    const closeBtn = page.getByRole('button', { name: /close/i }).last();
    try {
      await expect(closeBtn).toBeVisible({ timeout: 5000 });
      await closeBtn.click();
      await expect(closeBtn).not.toBeVisible();
    } catch (e) {
      // Modal didn't show up, which is fine
    }

    // Navigate to Help view via Topbar help icon
    // Scoped to <header> (the Topbar) since the sidebar/bottom nav also
    // expose a "Help & Manuals" button with the same accessible name.
    const topbarHelpBtn = page.locator('header').getByRole('button', { name: /help/i });

    // TEMP DEBUG: this test intermittently can't find the header in CI;
    // dump page state to the CI log to diagnose, then remove this block.
    if (!(await topbarHelpBtn.isVisible().catch(() => false))) {
      console.log('DEBUG url:', page.url());
      console.log('DEBUG title:', await page.title());
      console.log('DEBUG headerCount:', await page.locator('header').count());
      console.log('DEBUG bodyText:', (await page.locator('body').innerText().catch(() => '<no body>')).slice(0, 2000));
    }

    await expect(topbarHelpBtn).toBeVisible({ timeout: 10000 });
    await topbarHelpBtn.click();
  });

  test('should display the manual link with correct attributes', async ({ page }) => {
    // Check if Help & Manuals title is visible in the view content (the larger h2)
    const viewTitle = page.locator('main h2').getByText(/help & (manuals|handleidingen|manuels)/i);
    await expect(viewTitle).toBeVisible();

    // Look for the manual link
    const manualLink = page.locator('a[href="/manual.html"]');

    await expect(manualLink).toBeVisible();
    await expect(manualLink).toHaveAttribute('target', '_blank');
    await expect(manualLink).toHaveAttribute('rel', /noopener/);

    // Check for translated text (one of them should be present)
    const linkText = await manualLink.innerText();
    expect(linkText).toMatch(/open full manual|volledige handleiding openen|ouvrir le manuel complet/i);
  });

  test('should show language indicator for non-English active language', async ({ page }) => {
    const manualLink = page.locator('a[href="/manual.html"]');
    const linkText = await manualLink.innerText();

    // The language indicator (EN) should be there if not in English
    if (linkText.toLowerCase().includes('volledige') || linkText.toLowerCase().includes('ouvrir')) {
      await expect(manualLink.locator('span')).toContainText('(EN)');
    } else {
      // If we are in English, the span shouldn't exist or shouldn't have (EN)
      const span = manualLink.locator('span');
      if (await span.count() > 0) {
        const spanText = await span.innerText();
        expect(spanText).not.toContain('(EN)');
      }
    }
  });
});

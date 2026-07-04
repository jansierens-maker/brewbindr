# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: verify_auth_languages.spec.ts >> Verify Auth page in different languages
- Location: e2e/verify_auth_languages.spec.ts:3:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 60000ms exceeded.
Call log:
  - waiting for locator('text=E-mailadres') to be visible

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - complementary [ref=e5]:
    - button "BREWBINDR" [ref=e6]:
      - generic [ref=e7]:
        - img [ref=e9]
        - generic [ref=e11]: BREWBINDR
    - generic [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: Brouwerij
        - navigation [ref=e15]:
          - generic [ref=e16]:
            - button " Brewery " [ref=e17] [cursor=pointer]:
              - generic [ref=e19]: 
              - generic [ref=e20]: Brewery
              - generic [ref=e21]: 
            - generic: Aanmelden voor toegang
          - generic [ref=e22]:
            - button " Brews " [ref=e23] [cursor=pointer]:
              - generic [ref=e25]: 
              - generic [ref=e26]: Brews
              - generic [ref=e27]: 
            - generic: Aanmelden voor toegang
          - generic [ref=e28]:
            - button " Tasting Notes " [ref=e29] [cursor=pointer]:
              - generic [ref=e31]: 
              - generic [ref=e32]: Tasting Notes
              - generic [ref=e33]: 
            - generic: Aanmelden voor toegang
          - generic [ref=e34]:
            - button " Team " [ref=e35] [cursor=pointer]:
              - generic [ref=e37]: 
              - generic [ref=e38]: Team
              - generic [ref=e39]: 
            - generic: Aanmelden voor toegang
          - generic [ref=e40]:
            - button " Import " [ref=e41] [cursor=pointer]:
              - generic [ref=e43]: 
              - generic [ref=e44]: Import
              - generic [ref=e45]: 
            - generic: Aanmelden voor toegang
          - generic [ref=e46]:
            - button " Brewing Installation " [ref=e47] [cursor=pointer]:
              - generic [ref=e49]: 
              - generic [ref=e50]: Brewing Installation
              - generic [ref=e51]: 
            - generic: Aanmelden voor toegang
      - generic [ref=e52]:
        - generic [ref=e53]: Bibliotheek
        - navigation [ref=e54]:
          - button " Recipes" [ref=e56] [cursor=pointer]:
            - generic [ref=e58]: 
            - generic [ref=e59]: Recipes
          - button " Ingredients" [ref=e61] [cursor=pointer]:
            - generic [ref=e63]: 
            - generic [ref=e64]: Ingredients
      - generic [ref=e65]:
        - generic [ref=e66]: Systeem
        - navigation [ref=e67]:
          - button " Settings" [ref=e69] [cursor=pointer]:
            - generic [ref=e71]: 
            - generic [ref=e72]: Settings
          - button " Help & Manuals" [ref=e74] [cursor=pointer]:
            - generic [ref=e76]: 
            - generic [ref=e77]: Help & Manuals
    - generic [ref=e79]:
      - button "Sign In" [ref=e80]
      - button "Create Account" [ref=e81]
  - generic [ref=e82]:
    - banner [ref=e83]:
      - heading "BrewBindr" [level=2] [ref=e84]
      - generic [ref=e85]:
        - generic [ref=e86]:
          - button "Connected" [ref=e87]:
            - generic [ref=e89]: Connected
          - button "" [ref=e91]:
            - generic [ref=e92]: 
        - button "" [ref=e93]:
          - generic [ref=e94]: 
        - button " Aanmelden" [active] [ref=e95]:
          - generic [ref=e96]: 
          - generic [ref=e97]: Aanmelden
    - generic [ref=e98]:
      - generic [ref=e99]: 
      - paragraph [ref=e100]: Je bekijkt de publieke bibliotheek. Meld je aan om eigen recepten te bewaren, brouwsessies bij te houden en je voorraad te beheren.
    - main [ref=e101]:
      - generic [ref=e102]:
        - generic [ref=e103]:
          - generic [ref=e105]: 
          - heading "brewbindr" [level=2] [ref=e106]
          - paragraph [ref=e107]: Sign in to your brewery
        - generic [ref=e108]:
          - generic [ref=e109]:
            - generic [ref=e110]: Email Address
            - textbox "Email Address" [ref=e111]:
              - /placeholder: brewmaster@example.com
          - generic [ref=e112]:
            - generic [ref=e113]: Password
            - textbox "Password" [ref=e114]:
              - /placeholder: ••••••••
          - button "Sign In" [ref=e115]
        - button "Don't have an account? Sign Up" [ref=e117]
    - text:         
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  |
  3  | test('Verify Auth page in different languages', async ({ page }) => {
  4  |   test.setTimeout(60000);
  5  |   const languages = [
  6  |     { code: 'nl', loginText: 'Aanmelden', expectedLabel: 'E-mailadres' },
  7  |     { code: 'fr', loginText: 'Se connecter', expectedLabel: 'Adresse e-mail' },
  8  |     { code: 'en', loginText: 'Sign In', expectedLabel: 'Email Address' }
  9  |   ];
  10 |
  11 |   for (const lang of languages) {
  12 |     await page.goto(`http://localhost:5173/?lang=${lang.code}`);
  13 |
  14 |     // Wait for the Connection Details modal and close it
  15 |     const closeBtn = page.locator('button:has-text("CLOSE")');
  16 |     await closeBtn.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  17 |     if (await closeBtn.isVisible()) {
  18 |       await closeBtn.click();
  19 |     }
  20 |
  21 |     // Click login button in topbar
  22 |     const loginBtn = page.locator(`button:has-text("${lang.loginText}")`);
  23 |     await loginBtn.waitFor({ state: 'visible' });
  24 |     await loginBtn.click();
  25 |
  26 |     // Verify modal content
> 27 |     await page.waitForSelector(`text=${lang.expectedLabel}`);
     |                ^ Error: page.waitForSelector: Test timeout of 60000ms exceeded.
  28 |     await page.screenshot({ path: `verification/auth_${lang.code}.png` });
  29 |
  30 |     // Close auth modal for next iteration by clicking outside or Escape
  31 |     await page.keyboard.press('Escape');
  32 |     await page.waitForTimeout(500);
  33 |   }
  34 | });
  35 |
```
## What and why

<!-- What does this change, and why? Link the issue, e.g. "Closes #123". -->

## How was it tested?

<!-- Unit tests, manual checks, screenshots for UI changes. -->

## Checklist

- [ ] `npm test` and `npm run build` pass
- [ ] User-facing strings are in `services/i18n.ts` (EN, NL, FR)
- [ ] Form controls have `id`, `name`, a label and `maxLength`; icon-only buttons have `aria-label` or `title`
- [ ] Database changes: new idempotent migration in `supabase/migrations/`, also in `schema_update.sql`, with a pgTAP test for new rules
- [ ] Manual (`public/manual.html`, 3 languages) and help updated if usage changes

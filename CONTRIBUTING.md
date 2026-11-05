# Contributing to BrewBindr

Thanks for your interest in BrewBindr! Bug reports, ideas and pull requests are welcome.

## License of contributions

BrewBindr is **source available** under the [PolyForm Noncommercial License 1.0.0](LICENSE.md); it is not an OSI-approved open source license. By submitting a contribution (code, documentation, translations or other material) you confirm that you have the right to do so and agree that it is licensed under the same terms as the project.

## Reporting bugs and requesting features

- Search the [existing issues](https://github.com/jansierens-maker/brewbindr/issues) first.
- Use the issue templates: a bug report with the steps to reproduce, what you expected and what happened, or a feature request describing the problem you want to solve.
- **Security problems are never reported in a public issue.** See [SECURITY.md](SECURITY.md).

## Development setup

See the [README](README.md#getting-started) for prerequisites, configuration and the npm scripts. In short:

```bash
npm install
npm run dev     # development server
npm test        # unit tests (Vitest)
npm run build   # type check and production build
```

## Workflow

1. Create a branch from `main` (e.g. `feature/short-description` or `fix/short-description`). Never push to `main` directly.
2. Keep pull requests focused on one change and describe what and why.
3. Run `npm test` and `npm run build` before opening the pull request.
4. Open a pull request to `main`. CI (unit tests and build), the Playwright E2E tests on the Vercel preview and, for database changes, the Database workflow must pass. A maintainer reviews and merges.

Pull request titles may use `🎨 Palette: …` for UI/UX changes and `⚡ Bolt: …` for performance improvements.

## Database changes

- Every schema change is a new migration in `supabase/migrations/` named `<YYYYMMDDHHMMSS>_<description>.sql` (`npx supabase migration new <description>`). Never change an existing migration.
- Migrations are idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP … IF EXISTS`) and compatible with the app version in production: they are applied on merge while Vercel deploys the app.
- Append the same SQL to `schema_update.sql`, the full setup script for new databases.
- Add or update a pgTAP test in `supabase/tests/database/` for new rules (constraints, RLS, triggers, functions).
- Do not apply migrations to production by hand; the Database workflow does it after merge.

## Coding standards

- **TypeScript** in strict mode; use the types from `types.ts` and avoid `any`.
- **Files:** PascalCase for React components (`RecipeCreator.tsx`), camelCase for services and utilities (`supabaseService.ts`).
- **Translations:** every user-facing string goes through `services/i18n.ts` in English, Dutch and French.
- **Accessibility:** icon-only buttons have an `aria-label` or `title`; form controls have an `id`, a matching `<label htmlFor>` and a `name`.
- **Security:** wrap user data sent to the AI in XML-style tags (`<PROMPT>`, `<RECIPE>`); log only `error.message` in API handlers; set `maxLength` on user inputs.
- **Performance:** new screens are loaded with `React.lazy` inside `<Suspense>`; keep large, rarely used data out of the main bundle with a dynamic `import()`.
- **State:** React hooks; memoize expensive calculations and objects.
- **Calculations** in `services/calculations.ts` and `services/waterChemistry.ts` come with unit tests in `tests/unit/`.

## Documentation

When a change affects how the app is used, update the manual (`public/manual.html`, all three languages) and, where relevant, the short help in `components/HelpView.tsx`.

## Code of conduct

Everyone taking part in this project is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

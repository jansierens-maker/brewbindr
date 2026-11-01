# CLAUDE.md - Development Guide

## Project Setup & Commands
- **Install dependencies:** `npm install`
- **Development server:** `npm run dev`
- **Build project:** `npm run build` (executes `tsc && vite build`)
- **Preview build:** `npm run preview`

## Tech Stack
- **Frontend:** React 19, Vite 6, Tailwind CSS 4
- **Language:** TypeScript (strict mode)
- **Backend/DB:** Supabase (Auth, DB, Realtime)
- **AI:** Google Gemini SDK (`@google/genai`)
- **Deployment:** Vercel

## Development Workflow Rules
- NEVER push code changes directly to the `main` branch.
- ALWAYS create a new feature branch for any task (e.g., `feature/claude-task-name`).
- Once changes are complete, ALWAYS use the `/pr` command or `gh pr create` to open a Pull Request.
- Do NOT attempt to merge your own Pull Request; leave it open for human review.

## Database Changes
- Every schema change is a new migration in `supabase/migrations/` named `<YYYYMMDDHHMMSS>_<description>.sql` (`npx supabase migration new <description>`). Never change an existing migration file.
- Migrations must be idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP ... IF EXISTS`) and backward compatible with the app version currently in production: the migration is applied on merge, while Vercel deploys the app at the same time.
- Add or update a pgTAP test in `supabase/tests/database/` for new rules (constraints, RLS, triggers, functions).
- Also append the same SQL to `schema_update.sql` and to `SQL_SCHEMA` in `App.tsx` (the full setup script for new databases), so both stay identical.
- Do not apply migrations to production by hand: the `Database` workflow tests them on a fresh database in the PR and applies them on merge to `main`.
- Run the unit tests with `npm test` before opening a PR.

## Coding Style & Standards
- **Naming Conventions:**
  - Pull Requests: Use `🎨 Palette: [UX improvement]` for UI/UX changes and `⚡ Bolt: [performance improvement]` for performance optimizations.
  - Files: Use PascalCase for React components (e.g., `RecipeCreator.tsx`) and camelCase for services/utils (e.g., `supabaseService.ts`).
- **TypeScript:** Use explicit types from `types.ts` wherever possible. Avoid `any`.
- **Accessibility (A11y):**
  - Icon-only buttons MUST have `aria-label` or `title`.
  - Form controls MUST have `id` attributes and corresponding `htmlFor` label associations.
  - All form elements (`input`, `select`, `textarea`) MUST have a `name` attribute.
- **Security:**
  - AI Input: Wrap user-provided data in XML-style tags (e.g., `<PROMPT>`, `<RECIPE>`) to prevent prompt injection.
  - Error Logging: Log only `error.message` in API handlers; never log the full error object to prevent stack trace leaks.
  - Input Hardening: Enforce `maxLength` attributes on all user inputs to prevent oversized payloads.
- **State Management:** Use React hooks (`useState`, `useMemo`, `useCallback`). Memoize expensive calculations or objects (like `GeminiService` instances).
- **Internationalization:** Use `services/i18n.ts` for all user-facing strings (supports 'en', 'nl', 'fr').

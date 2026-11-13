# Environments

| | Production | Staging |
|---|---|---|
| App | brewbindr.vercel.app (Vercel *Production*) | Vercel *Preview* deployments (every PR) |
| Supabase project | `tgbeaombwskioefhunxf` | `xylsffujkzcwfeyxkzve` (`brewbindr-staging`) |
| Migrations | on merge to `main`, after approval (environment `production`) | on every PR (after the database tests pass) and on merge |
| E2E tests | read-only tests only (`@writes` skipped) | all tests |
| Test account | `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` (log in and out only) | `STAGING_TEST_USER_EMAIL` / `STAGING_TEST_USER_PASSWORD` |

Real data lives only in production. Previews, E2E runs and experiments use staging.

## Configuration

**GitHub secrets** (repository settings → Secrets and variables → Actions)
- `SUPABASE_ACCESS_TOKEN`: personal access token, works for both projects
- `SUPABASE_DB_PASSWORD`: production database password
- `STAGING_DB_URL`: connection string of the staging *Session pooler* with the password filled in (Supabase → brewbindr-staging → **Connect** → *Session pooler*; the password is the one from Settings → Database → Reset database password). GitHub runners have no IPv6, and for this project the CLI does not find the pooler by itself.
- `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`: production test account
- `STAGING_TEST_USER_EMAIL`, `STAGING_TEST_USER_PASSWORD`: staging test account (Supabase → brewbindr-staging → Authentication → Users → Add user, *Auto Confirm User*)

**Vercel environment variables** (project brewbindr → Settings → Environment Variables)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: one value for *Production* (production project) and one for *Preview* (staging project: `https://xylsffujkzcwfeyxkzve.supabase.co` and its anon key from Supabase → Settings → API Keys)
- `GEMINI_API_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`: may stay shared. Invitation e-mails from a preview are real e-mails.

**Staging Supabase settings** (one time, in the dashboard; not covered by migrations)
- Authentication → URL Configuration: Site URL and redirect URLs for the previews, e.g. `https://*-jansierens-makers-projects.vercel.app/**`
- Authentication → Providers → Email: minimum password length 12, as in production
- Authentication e-mails use Supabase's own mail service (no Resend SMTP): fine for testing, limited to a few per hour

## Test data

**Actions → Copy data to staging → Run workflow** copies from production to staging:
- the public library (all approved recipes and library items), and
- the own recipes, library items (ingredients, mash profiles, styles, installations, water profiles) and stock of the brewery of *source_email*,

into the brewery of *target_email* in staging (that account must exist there). Ids stay the same, so recipes keep pointing to their ingredients and installation. Running it again updates the copies; items in staging with the same name make room. Production is only read; brews, tasting notes, team members and other breweries are not copied. Script: `scripts/copy-to-staging.mjs` (uses `SUPABASE_ACCESS_TOKEN` and the Management API).

## Notes

- Staging can run ahead of `main`: migrations of open PRs are applied there as soon as their tests pass. A PR that is closed without merging leaves its migration on staging; migrations are idempotent, so this is usually harmless.
- Reset staging when it drifts: Supabase → brewbindr-staging → Database → reset (or delete and recreate the project, update `STAGING_PROJECT_ID` in `.github/workflows/database.yml`, the `STAGING_DB_URL` secret and the Vercel Preview variables), then re-run the Database workflow (*Run workflow*) or push to a PR.
- Free plan: a project with no activity for a week is paused. The E2E runs on previews keep staging active; when it is paused, restore it in the dashboard.

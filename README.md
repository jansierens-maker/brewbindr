<div align="center">
<img width="600" alt="BrewBindr" src="docs/brewbindr-logo.png" />
</div>

# BrewBindr

A brewing companion for home brewers: design recipes with live calculations, plan water and yeast, log brew days through fermentation and packaging, keep stock and record tastings — together with your team, with AI where it helps. Available in English, Dutch and French.

The full user manual (EN/NL/FR) ships with the app at [`/manual.html`](public/manual.html) and opens from **Help & Manuals**.

## Features

- **Recipes with live calculations** — OG, FG, ABV (precise formula), IBU (Tinseth with hop form and use corrections), colour (Morey, SRM or EBC) and BU:GU while you type. Fermentable types (grain, adjunct, sugar, extract), mash temperature effect on attenuation, style ranges.
- **AI** — generate a full recipe from a text prompt and get AI feedback on tasting notes (Google Gemini, with a daily limit per user).
- **Water volumes** — mash and sparge water, pre/post-boil volumes and strike temperature from your brewing installation, including capacity-limited systems like the Brewie; mash and sparge water can be set per recipe.
- **Water treatment** — water profiles (your tap water, classic waters, 19 beer styles), salt additions with suggestions, residual alkalinity, sulfate/chloride ratio, estimated mash pH and lactic acid for a target pH.
- **Brew logs** — brew day, fermentation, conditioning and bottling or kegging: SG or °Plato, hydrometer temperature and refractometer corrections, yeast pitch rates and starters, priming sugar or keg pressure.
- **Tasting notes, ingredient library and stock** — with optional stock management showing which recipes you can brew.
- **Breweries and roles** — shared workspaces with admin, brewmaster, brewer and taster roles, e-mail invitations and realtime sync across devices.
- **Public library** — submit recipes and ingredients; admins review, publish, unpublish and delete.
- **BeerXML** — import and export recipes and ingredients.

## Tech stack

React 19, TypeScript (strict), Vite 8, Tailwind CSS 4 · Supabase (Auth, Postgres with RLS, Realtime) · Vercel (hosting and serverless functions in [`api/`](api/)) · Google Gemini (`@google/genai`) · Resend (invitation e-mails).

## Prerequisites

- **Node.js** 26 (the version Vercel runs; set in `package.json` → `engines`)
- A **Supabase** project
- A **Google Gemini API key** for the AI features
- A **Resend API key** for invitation e-mails

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/jansierens-maker/brewbindr
cd brewbindr
npm install
```

### 2. Configuration

Create a `.env.local` file in the root directory (and set the same variables in Vercel):

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# AI (Google Gemini)
GEMINI_API_KEY=your_gemini_api_key

# Invitation e-mails (Resend)
RESEND_API_KEY=your_resend_api_key
NEXT_PUBLIC_SITE_URL=https://your-domain
```

### 3. Database

For a new database, run [`schema_update.sql`](schema_update.sql) in the Supabase SQL Editor. It creates all tables, RLS policies, triggers and functions, and is idempotent, so it is safe to re-run. The same script is shown in the app under **Connection Details**. Alternatively, link the project with the Supabase CLI and run `npx supabase db push`.

### 4. Run locally

```bash
npm run dev       # development server on http://localhost:5173
npm test          # unit tests (Vitest)
npm run build     # type check and production build
npm run preview   # serve the production build
```

> **Note**: the AI and invitation features run as serverless functions in `api/`. To use them locally, run the app with [Vercel CLI](https://vercel.com/docs/cli) (`vercel dev`).

## Development workflow

- Work on a feature branch and open a pull request to `main`; `main` is never pushed to directly.
- **Database changes** are new migrations in [`supabase/migrations/`](supabase/migrations/) named `<YYYYMMDDHHMMSS>_<description>.sql` (`npx supabase migration new <description>`). They must be idempotent and compatible with the app version in production, and are also appended to `schema_update.sql`. New rules (constraints, RLS, triggers, functions) get a pgTAP test in [`supabase/tests/database/`](supabase/tests/database/). Never change an existing migration. The older hand-applied scripts in [`migrations/`](migrations/) are kept for reference.
- See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how to contribute and the coding standards (types, accessibility, i18n, security).

### GitHub Actions

| Workflow | When | What |
|---|---|---|
| **CI** | Pull requests to `main` | Unit tests and build |
| **E2E** | Each Vercel deployment | Playwright tests against the preview (secrets `VERCEL_AUTOMATION_BYPASS_SECRET`, `TEST_USER_EMAIL`, `TEST_USER_PASSWORD`) |
| **Database** | Pull requests and merges to `main` | PR: all migrations on a fresh database, pgTAP tests and a dry run against production. Merge: applies new migrations after approval in the `production` environment (secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`) |

Do not apply migrations to production by hand; the Database workflow does it on merge.

## Administration

### Security recommendations

- **Leaked Password Protection**: in the Supabase Dashboard, go to **Authentication > Attack Protection** and enable it.
- **Row-Level Security**: the schema enables RLS on all tables. Data separation between breweries depends on these policies and the database functions, not on the frontend — keep that in mind when changing the schema.

### App administrators

New users get the `user` role. To make someone an app administrator (Admin screen, public library review, higher AI limit):

1. Create an account in BrewBindr.
2. Find the **User ID** under **Authentication > Users** in the Supabase Dashboard.
3. Run in the SQL Editor:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
   ```

Brewery roles (admin, brewmaster, brewer, taster) are managed in the app under **Team**.

## Deployment

The app is deployed on [Vercel](https://vercel.com): import the GitHub repository, add the environment variables above, and Vercel builds the frontend and the functions in `api/`. Every pull request gets a preview deployment; merges to `main` go to production.

## Contributing and security

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately as described in [SECURITY.md](SECURITY.md), never in a public issue.

## License

BrewBindr is source available under the [PolyForm Noncommercial License 1.0.0](LICENSE.md): free to use, change and share for noncommercial purposes. It is not an OSI-approved open source license.

---
© 2026 Jan Sierens — BrewBindr

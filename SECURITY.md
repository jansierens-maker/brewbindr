# Security Policy

## Supported versions

Only the current version on the `main` branch, deployed at https://brewbindr.vercel.app, receives security fixes.

## Reporting a vulnerability

**Please do not report security problems in a public issue, discussion or pull request.**

Report them privately through GitHub: go to the **Security** tab of this repository and choose **Report a vulnerability** ([direct link](https://github.com/jansierens-maker/brewbindr/security/advisories/new)).

Please include:

- what the problem is and where (screen, API route, database function),
- the steps to reproduce it,
- the possible impact, for example access to another brewery's data.

You can expect an acknowledgement within a week. Once the problem is confirmed, a fix is prepared and released, and you are credited in the advisory unless you prefer otherwise.

## Scope

In scope: the BrewBindr web app, the serverless functions in `api/`, and the database schema, policies and functions in `supabase/` and `schema_update.sql`.

Out of scope: vulnerabilities in third-party services themselves (Supabase, Vercel, Google Gemini, Resend), denial-of-service tests, social engineering, and tests against other users' accounts or data. Only test with accounts and breweries you own.

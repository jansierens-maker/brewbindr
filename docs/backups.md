# Backups

BrewBindr has three kinds of backup.

| Backup | Who | What | Where |
|---|---|---|---|
| **Brewery backup** | brewery admin | the brewery's recipes, brews, tasting notes, ingredients with stock, mash and water profiles, beer styles, installations | JSON file, Settings → Brewery |
| **Full backup** | app admin | all breweries, members (not their accounts), all data, the public library, stock | JSON file, Admin |
| **Database dump** | automatic, weekly | the whole production database, accounts included | encrypted GitHub artifact, 90 days |

## Restore in the app (brewery and full backup)

Restoring **merges**. Items in the backup overwrite the same items, the rest is added, and nothing is deleted. A confirmation shows how many items are new and how many are overwritten.

- A **brewery backup** goes into your own brewery. From another brewery (e.g. staging → production, or a new account), every item gets a new id, always the same one for the same backup. Restoring twice therefore does not duplicate anything. An item whose name your brewery already uses is merged into that item. References follow: the recipe of a brew, the brew of a tasting note, ingredients, water profiles, the installation. Items that are public by now are left as they are.
- A **full backup** brings back breweries, data and stock. Accounts cannot be recreated: members without an account no longer get their profile back, and their data comes back without a maker. Invitations are not in it.

## The weekly database dump

Workflow `.github/workflows/backup.yml`, every Monday at 03:17 UTC; you can also start it by hand under Actions → Backup → Run workflow.

1. `supabase db dump` makes `roles.sql`, `schema.sql` and `data.sql` (data includes the accounts in `auth`).
2. The three files are packed and encrypted with **AES-256** (`gpg --symmetric`) using the `BACKUP_PASSPHRASE` secret. The unencrypted dump never leaves the runner.
3. The file `brewbindr-db-YYYY-MM-DD.tar.gz.gpg` is kept as a workflow artifact for 90 days.

The repository is **public**: anyone with a GitHub account can download the artifacts. That is why only the encrypted file is stored. Without `BACKUP_PASSPHRASE` the workflow stops and stores nothing.

### Set up (once)

1. Make a long random passphrase (at least 20 characters, e.g. from your password manager) and **keep it in your password manager**. Without it the backups cannot be opened.
2. GitHub → repository → Settings → Secrets and variables → Actions → **New repository secret**: name `BACKUP_PASSPHRASE`, value the passphrase.
3. Actions → Backup → **Run workflow**, and check that it ends green with an artifact.

`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` already exist for the Database workflow.

### Restore a dump

Only when the database itself is lost or damaged; for normal mistakes, the app's backups are simpler.

```bash
# 1. Download the artifact (Actions → Backup → the run → Artifacts) and unzip it
unzip brewbindr-db-2026-11-16.zip

# 2. Decrypt and unpack (asks for the passphrase)
gpg -d brewbindr-db-2026-11-16.tar.gz.gpg | tar -xzf -

# 3. Restore into a NEW, empty Supabase project (connection string: Connect → Session pooler)
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "postgresql://postgres.<ref>:<password>@<host>:5432/postgres"
```

This follows Supabase's guide for restoring a `db dump` ("Backup and restore using the CLI"). Then point the Vercel environment variables to the new project.

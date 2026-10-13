# Database backups (nightly → Cloudflare R2)

An independent, off-site copy of the whole production database, in case Neon's
own point-in-time window isn't enough (project deleted, account locked, or data
loss noticed late).

- **What:** full `pg_dump` of the Neon database (all data, all companies).
- **When:** every night at **02:00 UTC** (plus a manual "Run workflow" button).
- **Where:** your Cloudflare R2 bucket, under `db/caremid-<timestamp>.dump`.
- **Retention:** the last **30 days** (older ones are deleted automatically).
- **Runs on:** GitHub Actions (`.github/workflows/db-backup.yml`). It only **reads**
  the database — it never writes to it.

It stays dormant (skips with a warning, no error emails) until the secrets below
are set.

---

## One-time setup (≈10 minutes, all in a browser)

### 1. Make a dedicated R2 bucket for backups
In the **Cloudflare dashboard → R2**:
1. **Create bucket** → name it `caremid-backups`.
   - Use the **EU jurisdiction** (same as your documents bucket) to keep UK/EU
     care data in the EU.
2. Keep it **private** (do NOT enable public access).

### 2. Make an R2 API token scoped to that bucket
R2 → **Manage R2 API Tokens** → **Create API Token**:
- Permissions: **Object Read & Write**.
- Specify bucket: **caremid-backups** only (least privilege).
- Create it, then copy the **Access Key ID** and **Secret Access Key** (shown once).
- Note the **S3 API endpoint** for your account — it looks like
  `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (or the EU variant Cloudflare
  shows for the bucket).

### 3. Get the database connection string
From **Render → the API service → Environment**, copy the value of
**`DATABASE_URL`** (the Neon connection string, starts `postgresql://…` and ends
with `?sslmode=require`). Or copy it from the Neon dashboard's "Connection string".

### 4. Add the secrets to GitHub
Repo on GitHub → **Settings → Secrets and variables → Actions → New repository
secret**. Add these five:

| Secret name | Value |
|---|---|
| `DATABASE_URL` | the Neon connection string from step 3 |
| `R2_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (from step 2) |
| `R2_BACKUP_BUCKET` | `caremid-backups` |
| `R2_ACCESS_KEY_ID` | Access Key ID from step 2 |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key from step 2 |

### 5. Test it
GitHub → **Actions** tab → **Nightly DB backup** → **Run workflow** → **Run**.
It should finish green in a minute or two. Check R2 → `caremid-backups/db/` for a
`caremid-….dump` file. Done — it now runs automatically every night.

---

## Restoring from a backup

You'll need `pg_restore` (comes with the PostgreSQL client tools) and a **target**
database — usually a **fresh, empty Neon database/branch**, never straight over a
live one unless you intend to overwrite it.

1. Download the chosen `caremid-<timestamp>.dump` from R2 (Cloudflare dashboard,
   or `aws s3 cp` with the backup token).
2. Restore it:

   ```bash
   pg_restore --no-owner --no-privileges \
     --clean --if-exists \
     -d "<TARGET_DATABASE_URL>" \
     caremid-<timestamp>.dump
   ```

   - `--clean --if-exists` drops existing objects first — safe into a fresh DB,
     and what you want when overwriting.
   - Point the app's `DATABASE_URL` (on Render) at the restored database and
     redeploy.

> Test a restore into a throwaway Neon branch once in a while — a backup you've
> never restored isn't a backup you can trust.

---

## Notes / future hardening
- The bucket is **private** and R2 encrypts objects at rest. For extra safety you
  could GPG-encrypt dumps before upload (adds key management) — ask if you want it.
- Also keep a secure note of the **Render env vars** (DATABASE_URL, JWT secret,
  VAPID keys, R2 keys, OPENAI key) so the API service can be rebuilt from scratch.
- Code is already backed up via GitHub + the local clone at `D:\Claude Am`.

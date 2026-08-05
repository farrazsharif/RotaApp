# Caremid (RotaApp) — Recovery Runbook

**Purpose:** if something goes wrong (a bad deploy, a broken page, a change you want to undo), this file tells you how the system is put together and how to get back to a working state. Keep a copy somewhere outside the repo too (e.g. Dropbox), so you still have it even if you can't reach the code.

_Last updated: 2026-08-04 · Known-good commit: `a57aaf4a` on branch `main`._

---

## 1. What Caremid is

Caremid is a care-workforce scheduling system. The code lives in **one repository** ("monorepo") with five apps:

| Folder | What it is | Lives at |
|---|---|---|
| `frontend/` | Manager/office portal (rota, staff, eMAR, reports) | **portal.caremid.co.uk** |
| `carer-app/` | Carer phone app (PWA) | **carer.caremid.co.uk** |
| `family-portal/` | Family/next-of-kin view | **family.caremid.co.uk** |
| `website/` | Marketing site | **caremid.co.uk** |
| `backend/` | API + database (Express + Prisma + Postgres) | **api.caremid.co.uk** |

**Tech:** React + TypeScript + Vite + Tailwind (front ends); Node + Express + Prisma (backend); PostgreSQL database hosted on **Neon**.

---

## 2. Where everything lives

- **Code (local):** `C:\Users\sirgr\Software\RotaApp`
- **Code (GitHub):** `github.com/farrazsharif/RotaApp` — default branch **`main`**. This is the real backup: every change is a commit here.
- **Frontends hosting:** Vercel (4 separate projects, all connected to this repo)
- **Backend hosting:** Render (service **caremid-api**)
- **Database:** Neon (PostgreSQL) — connected to Render via an environment variable
- **Brand assets:** `C:\Users\sirgr\Dropbox\1. Care 24\Caremid Software\Logo`

---

## 3. How deploys work (important)

**Everything deploys automatically when you push to `main`.** Each app rebuilds **only when its own folder changes**:

| Folder changed | Rebuilds | Vercel project |
|---|---|---|
| `frontend/` | portal.caremid.co.uk | **rota-app** |
| `website/` | caremid.co.uk | **rota-app-btk4** |
| `family-portal/` | family.caremid.co.uk | **rota-app-lf1o** |
| `carer-app/` | carer.caremid.co.uk | **carerapp** |
| `backend/` | api.caremid.co.uk (Render) | service **caremid-api** |

A frontend deploy takes ~1–2 min. The backend (Render) is slower to spin up. A change touching both `frontend/` and `backend/` triggers both.

### The database has NO migration step
The backend does **not** run `prisma migrate`. Instead, on every startup it runs a function called **`ensureColumns`** (`backend/src/lib/ensureColumns.ts`) that safely adds any new tables/columns with raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. So a new database field needs three things in the code: the field in `backend/prisma/schema.prisma`, a line in `ensureColumns.ts`, and `npx prisma generate`. **Nothing is dropped or wiped** — it only adds.

---

## 4. Known deploy problems + fixes

- **A push didn't trigger a build (Vercel missed the webhook).** Push another commit to re-fire it:
  ```bash
  git commit --allow-empty -m "Re-trigger deploy" && git push origin main
  ```
  If it keeps missing, reconnect Git in that Vercel project → Settings → Git.

- **The carer app (`carerapp`) auto-deploy is broken.** Its webhook stopped firing. It has a **Deploy Hook** — fire it manually to build the tip of `main`:
  ```bash
  curl -s -X POST "https://api.vercel.com/v1/integrations/deploy/prj_lJvC42rKpe1ryRADqAaqzNWtetJI/MSEO2sYDLB"
  ```
  A healthy response looks like `{"job":{...,"state":"PENDING"}}`. Do **not** click "Redeploy" on an old failed build — that rebuilds the old commit. If the hook stops working, create a fresh one in carerapp → Settings → Git → Deploy Hooks (branch `main`).

- **Check a deploy actually went live** (no login needed):
  ```bash
  curl -s https://carer.caremid.co.uk/ | grep -o '/assets/index-[^"]*\.js'
  ```
  The filename hash changes when a new build is live.

---

## 5. How to recover / roll back

### A. Undo the most recent change (safest — keeps history)
```bash
cd /c/Users/sirgr/Software/RotaApp
git revert HEAD          # makes a new commit that undoes the last one
git push origin main     # auto-deploys the fix
```
To undo a specific older change, use its commit id: `git revert <commit-id>`.

### B. Go back to a known-good commit
Find a good commit: `git log --oneline -20`. Then:
```bash
git revert --no-edit <bad-commit>..HEAD   # undo everything after the good one (safe, keeps history)
git push origin main
```
Avoid `git reset --hard` + force-push unless you're certain — it rewrites history. `git revert` is safer and always deploys cleanly.

### C. Redeploy the current code without changing anything
- **Vercel:** open the project → Deployments → the latest **successful** row → "Redeploy".
- **Render (backend):** open **caremid-api** → "Manual Deploy" → "Deploy latest commit".
- **Carer app:** fire the deploy hook in section 4.

### D. Database recovery
- The database is **Neon**. Neon keeps its own automatic backups and supports point-in-time restore / branching from its dashboard — use that if data was lost or corrupted.
- The app code never drops columns or wipes data (`ensureColumns` only adds). So a bad code deploy is fixed by reverting the code (section A), not by touching the database.
- **Passwords cannot be recovered** — they're stored one-way encrypted (bcrypt). If a user is locked out, reset their password; you can't read the old one.

---

## 6. Rebuild / check locally before deploying

Open **Git Bash** (or the terminal in the Claude desktop app). **You must `cd` into the app's folder first** — running a build from the wrong folder silently builds the wrong app.

```bash
# Portal (and same pattern for carer-app / family-portal / website)
cd /c/Users/sirgr/Software/RotaApp/frontend
npx tsc --noEmit      # type-check (catches errors)
npx vite build        # production build

# Backend
cd /c/Users/sirgr/Software/RotaApp/backend
npx tsc --noEmit
npx prisma generate   # after any schema.prisma change
```
Node version in use: **v24**.

To run the whole thing locally against a **safe, isolated copy** (no risk to production), use the **CaremidSolutions** sandbox — see section 8.

---

## 7. Secrets & configuration (where they live — not in this file)

Secrets are **never** stored in the repo. They live in the hosting dashboards as environment variables:
- **Render → caremid-api → Environment:** database URL (Neon), email/SMTP, Stripe keys, push (VAPID) keys, JWT secret.
- **Vercel → each project → Settings → Environment Variables:** the API URL each frontend points to.
- **Local backend:** `backend/.env` (git-ignored).

If you ever need to move hosts, copy these env vars across; the code needs the same variable names.

---

## 8. The safe practice copy (sandbox)

`C:\Users\sirgr\Software\CaremidSolutions` is an **isolated local copy** for experimenting. It has **no GitHub remote** (pushing can never deploy), uses a **local database**, and blank Stripe/email keys. Use it to try risky changes without touching production. Login `admin@test.com` / `Admin123`. See its own `SANDBOX.md`.

---

## 9. Verification & accounts

- **Live API base:** `https://api.caremid.co.uk/api`
- **Demo/test login** (for checking things work): `admin@test.com` / `Admin123`.
- Real admin/office accounts are managed inside the portal (Staff page). Password resets are self-service via "Forgot password?" on the login pages.

---

## 10. Good habits

- Every change is committed and pushed to `main`, so **GitHub is your always-up-to-date backup**. You can see and restore any past version there.
- Before a risky change, note the current commit id (`git rev-parse --short HEAD`) so you know a safe point to return to. Today's is **`a57aaf4a`**.
- Keep a copy of this file outside the repo (Dropbox) so it's available even if the code isn't.

---

_If you're using Claude Code for recovery, point it at this file and the situation — it can run the git/deploy steps above for you._

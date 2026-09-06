# Session Handoff — Caremid (RotaApp)

**Purpose:** a durable snapshot so this work survives a drive failure and any future
session (or person) can resume cold. This file is committed to GitHub, so it lives
off your machine. Keep a copy in Dropbox too.

_Written: 2026-09-06 · Recovered onto: `D:\Claude Am` · Repo tip at recovery: `872cef7f`._

---

## 1. What happened
The local drive failed and the project was recovered by cloning
`github.com/farrazsharif/RotaApp` (branch `main`) into `D:\Claude Am`.
GitHub had every commit — no code was lost.

## 2. Current local state (as of this handoff)
- Repo cloned, working tree clean, up to date with `origin/main`.
- Dependencies installed in all 5 apps (`npm install`, Node v24).
- Prisma client generated (`npx prisma generate`).
- All 5 apps type-check clean (`npx tsc --noEmit`).
- `.env` files scaffolded:
  - `backend/.env` — all variables present with **placeholders**; real values must
    be pasted from **Render → caremid-api → Environment**.
  - `frontend/.env`, `carer-app/.env`, `family-portal/.env` — point at the **live API**
    (`https://api.caremid.co.uk/api`) so they run immediately; commented localhost
    lines switch them to a local backend.

## 3. How to resume from scratch on a new machine
```bash
git clone https://github.com/farrazsharif/RotaApp.git
cd RotaApp
# For each app you need: cd <app> && npm install
# Backend also: cd backend && npx prisma generate
# Recreate backend/.env from Render dashboard (see §4).
# Recreate frontend .env files (VITE_API_URL / VITE_SOCKET_URL) — see backend/.env.example
#   and the app defaults (live API in prod, /api in dev).
```
Full architecture + rollback steps are in [`RECOVERY.md`](../RECOVERY.md).

## 4. Secrets — where they live (NOT in git)
- **Render → caremid-api → Environment:** `DATABASE_URL` (Neon), `JWT_SECRET`,
  SMTP/Brevo, Stripe keys, VAPID push keys.
- **Vercel → each project → Settings → Environment Variables:** the API URL per frontend.
- **Recommendation:** export these into a password manager or an encrypted Dropbox
  note so you have them even if you're locked out of the dashboards.

## 5. Deploy model (recap from RECOVERY.md)
Push to `main` auto-deploys — but each app rebuilds **only when its own folder changes**:
`frontend/`→portal, `website/`→marketing, `family-portal/`→family, `carer-app/`→carer
(flaky webhook; use its Deploy Hook), `backend/`→Render api. A docs-only change like
this file triggers **no deploy**.

## 6. Backup checklist (do this to stay safe)
- [x] Code on GitHub (automatic on every push).
- [x] `RECOVERY.md` + this handoff committed (off-machine backup).
- [ ] Secrets exported to password manager / encrypted Dropbox.
- [ ] Copy of `RECOVERY.md` + `SESSION-HANDOFF.md` in Dropbox (readable even if repo is unreachable).
- [ ] Commit & push regularly — GitHub is only as current as your last push.

## 7. Standing agreement with Claude
Claude may pull/push/deploy going forward, but will show the exact change and get a
one-line confirmation before pushing to `main` (because that auto-deploys production).
Reversible work (pull, install, local builds, branches, logs) happens without asking.

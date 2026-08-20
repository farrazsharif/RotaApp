# Sandbox (B1) — experimenting on a copy of Care24 data

A safe way to build and test new features against **real Care24 data** without
ever touching the live database. You run the app **locally** against a **Neon
branch** — a full, isolated copy of production. Live data is never affected.

> **Two-window workflow**
> - **Production window** — real changes: commit + push to `main` → auto-deploy.
> - **Sandbox window (this)** — experiments only, local, against the Neon branch. Never writes to live.

---

## ⚠️ Before you start

`backend/.env` normally points `DATABASE_URL` at the **main Care24 database**. If
you run the app without changing it, "local" is talking to **live data**. The one
job of setup is to repoint that line at a **branch**.

`.gitignore` already covers `.env`, `.env.dev`, `.env.*` — the branch connection
string is never committed. Keep it that way.

---

## One-time setup

### 1. Create the branch (Neon console)
1. Neon → project → **Branches** → **New branch**.
2. Parent = the **production** branch (default/primary), include data → **Create**.
3. Open the branch → **Connection string** → copy the **pooled** URI (ends with
   `?sslmode=require`). Its host is a *different* `ep-…neon.tech` id — that's how
   you know it's the copy, not prod.

### 2. Point the local backend at the branch
In `backend/.env`, replace **only** the `DATABASE_URL` line with the branch URI.
Leave `JWT_SECRET`, SMTP, VAPID, `PORT=4000`, etc. unchanged (they keep local
logins/tokens working against the copied users).

> Save the current prod `DATABASE_URL` to a scratch note first, in case you ever
> want to switch back. (Local prod access isn't needed for sandbox work —
> production runs on Render with its own env, untouched by this file.)

---

## Running it

Backend (first time: `npm install`):

```bash
cd backend && npx prisma generate && npm run dev
```

- Connects to the branch, runs `ensureColumns` on boot (idempotent — tops up new
  columns). No `prisma migrate`, no seed: the branch already has prod's schema +
  data. Listens on **:4000**.

Portal:

```bash
cd frontend && npm install && npm run dev
```

- Serves on **http://localhost:5173**, proxies `/api` → `localhost:4000`
  automatically (no frontend env needed). Log in with a **real Care24 account**.

Carer app (only if testing carer features): same pattern in `carer-app/`.

### Prove isolation (do this once)
Make a harmless edit locally (e.g. rename a test note), then check
**portal.caremid.co.uk** — the change must **not** appear there. If it doesn't,
you're correctly on the branch. If it does, `.env` is still on the prod host.

---

## Refreshing the sandbox data

When the copy goes stale, pull the latest real data back in:

- Neon → sandbox branch → **Reset from parent** (keeps the same connection
  string). Restart the backend; your in-progress feature's columns re-apply on
  boot via `ensureColumns`.

This **wipes sandbox-only data** (test records you entered) — that's expected;
sandbox data is disposable. Your feature **code** (in git) and **schema** (in
`schema.prisma` + `ensureColumns.ts`) are unaffected.

---

## Promoting a proven feature to production

You promote **code, never data**. From the **production window**:

1. Merge the feature code to `main` and push.
2. Push auto-deploys: Render backend redeploys and self-migrates via
   `ensureColumns` (additive, `IF NOT EXISTS`, safe defaults); Vercel portal
   auto-deploys; fire the carer-app deploy hook if carer-app changed.

Sandbox data never crosses over. Existing Care24 rows stay valid — new columns
start empty/default.

### Golden rule
Every schema change lives in `schema.prisma` **and** `ensureColumns.ts` — never
hand-edited in the Neon branch console. That way both sandbox and prod pick it up
the same way, and production self-applies it on deploy. New models must also be
added to the `TENANT_MODELS` set in `backend/src/lib/prisma.ts`.

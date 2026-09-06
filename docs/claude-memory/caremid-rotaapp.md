---
name: caremid-rotaapp
description: "Caremid (RotaApp) monorepo — structure, hosting, deploy model, and local setup at D:\\Claude Am"
metadata: 
  node_type: memory
  type: project
  originSessionId: 37d8e15d-63ee-4aef-ab97-56d488eb186c
  modified: 2026-09-06T14:05:15.847Z
---

Caremid (repo: github.com/farrazsharif/RotaApp, branch `main`) is a care-workforce scheduling monorepo, recovered to `D:\Claude Am` after a 2026-09-06 drive failure (original path was `C:\Users\sirgr\Software\RotaApp`). Node v24.

Five apps, each auto-deploys when ITS OWN folder changes on a push to `main`:
- `frontend/` → portal.caremid.co.uk (Vercel project rota-app)
- `website/` → caremid.co.uk (Vercel rota-app-btk4)
- `family-portal/` → family.caremid.co.uk (Vercel rota-app-lf1o)
- `carer-app/` → carer.caremid.co.uk (Vercel carerapp; auto-deploy webhook is flaky — use its Deploy Hook)
- `backend/` → api.caremid.co.uk (Render service caremid-api; Express + Prisma + Postgres on Neon)

DB has NO migration step: backend runs `ensureColumns` on startup (only ADDs columns, never drops). New field needs: schema.prisma + ensureColumns.ts line + `npx prisma generate`.

Secrets live only in hosting dashboards (Render env for backend; Vercel env per frontend), never in repo. Local `backend/.env` scaffolded with all vars (DATABASE_URL, JWT_SECRET, SMTP/BREVO, STRIPE_*, VAPID_*) — user pastes values from Render. Frontends' `.env` point at live API by default (VITE_API_URL=https://api.caremid.co.uk/api).

Full runbook is `RECOVERY.md` in the repo. Sandbox for risky experiments: `C:\Users\sirgr\Software\CaremidSolutions` (no remote, local DB). See [[caremid-deploy-guardrail]].
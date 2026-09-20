# Caremid vs Caremid Solutions — Feature Gap

**What this is:** everything the production app (**Caremid**, `farrazsharif/RotaApp`) has that the testing sandbox (**Caremid Solutions**, `farrazsharif/caremid-solutions`) is missing. Use it as the checklist if you ever want to bring the sandbox up to parity.

_Generated 2026-09-07 by diffing the two working copies (excluding node_modules, builds, secrets, and pure config/branding). Scope: **Caremid-ahead only** — a few sandbox-only items are listed at the end for awareness._

**Scale of the gap:** 59 files exist only in Caremid, 125 shared files differ. Caremid is substantially ahead; the sandbox is roughly the pre-"Supported Living" version of the app.

---

## 1. Major new modules (whole features absent from the sandbox)

### A. Supported Living & Live-in Care  *(the largest new area — full stack)*
- **Care type split:** `ServiceUser.careType` = `DOMICILIARY` | `SUPPORTED_LIVING`, which branches behaviour across the office portal and carer app.
- **Housing/tenancy data:** `housingProvider`, `housingScheme`, `housingOfficerName/Phone/Email`, `tenancyStartDate`, `tenancyRef` on service users; matching housing fields on **Sites**, which can be flagged as SL schemes.
- **Site → client sync:** toggling a site's SL flag re-syncs every client on it to/from `SUPPORTED_LIVING`; a client's care type is derived from its site.
- **Supported Living page** in the office portal (+ sidebar nav), grouping clients by scheme/site.
- **Support Log** (`SupportLogEntry` model, `/api/support-log`): a timestamped running support diary for SL clients that *replaces* the call log for those visits. Carer app has a running support-log composer; clock-out is gated on at least one entry. Shown on ServiceUserDetail and in the shift drawer.
- **Support-domain tagging:** `supportDomains` on visits/call logs (normalised to ≤30 keys); carer taps "support given today" domain chips; blue domain badges render on logs/history.
- **Supported Living support plan** (`SL_SUPPORT_PLAN`): printable plan across support domains (`SupportedLivingPlanModal`).
- **Live-in placements** (`Placement` + `LiveInDailyLog` models, `/api/placements`): carer living in a client's home for a date range, `SLEEP_IN`/`WAKING` night type, status lifecycle. Office `PlacementModal` (integrated into Schedule); carer-app Live-In Placement page/card with a per-day diary log.

### B. Risk Assessments & person-centred documents  *(new — full stack)*
- **RiskAssessment model + `/api/risk-assessments`.** One record per (client, type). Types: Environment, Fire Safety, Bathing (Low/Med/High hazard scoring), plus One Page Profile, Contract of Care, SL Support Plan stored in the same table.
- Office **RiskAssessmentModal** with a schema library and **branded printouts**.
- **One Page Profile** form and **Contract of Care** modal (weekly visit hours pulled live from the care plan; medication-administration contract with signatures).
- ServiceUserDetail surfaces Risk Assessments, One Page Profile, Contract of Care, Support Plan, and a **"missing documents" checklist**; CQC dashboard now checks these document types.
- Carer app: read-only **Risk tab** on the service-user screen.

### C. Missed Meds & MAR chart upgrades
- **`doseOwnership` engine** (shared by carer app + MAR): assigns each scheduled dose to the nearest visit, overnight-aware.
- **Cancelled-dose handling:** new `CANCELLED` med status; `/api/medications/cancelled-doses` computes which slots fall on cancelled visits so the MAR renders **"C"**.
- **Office record/correct a MAR entry after the fact** (`/api/medications/administrations/manage`, `manage_medications`): attribute to the real carer, set the real time given, fully audited. UI: `RecordMedModal`.
- **Missed Meds page** (manager-only) + `reports.missedMeds` report: attended / no-clock-out / not-attended, short visits, ECM notes, auto-refreshing.
- Discontinue = **soft-delete keeping history** + stamps `endDate`; MAR can show discontinued meds' history; administrations filterable by status.

### D. Office backfill for offline carers
- **Manager records a missed visit's clock in/out** (`/api/clock/records`, `manage_schedule`), attributed to the carer, audited.
- **Carer self-records a past visit they forgot to clock** (`/api/clock/records/self`): own visits, past days, 7-day window, audited as "recorded late". UI: `RecordMissedVisit`.
- **Manager enters a visit's call log** on the carer's behalf (`createCallLogAsManager`), audited.

### E. "Held on paper" compliance seeding
- **PaperSeedModal / PaperSupervisionModal:** log spot checks, service reviews, and staff supervisions already done on paper so the next-due date schedules without re-entering the whole form.
- **`source` field** (`form` | `paper`) on Review, SpotCheck, Supervision, StaffSupervision, with a **"Paper" badge** across those pages; supervision `note` + optional `nextReviewDate` override.

### F. Staff-file compliance (CQC Reg 19)
- **Staff File Checklist editor** in Settings (configurable required documents/references, categories, counts, CQC defaults).
- Per-staff **Compliance tab** on StaffDetail (deep-links to the right staff-file tab); **compliance pills + filter** on the Users list; `/api/users/compliance` + `/api/users/:id/compliance` endpoints; document uploads invalidate compliance.
- StaffDetail also gains **Permissions** and **Emergency Contact** tabs; `staffType` = LOCAL/OVERSEAS with a Users filter.

---

## 2. Enhancements to existing features

**Scheduling**
- Shift **zoom** control; assignment filters (assigned / unassigned / to-publish); call-type visit filter.
- **One-click Undo** of bulk carer assignments (`AssignUndo` + `restoreAssignments` / `/api/shifts/restore-assignments`).
- Cancel/delete recurring shifts by **specific weekdays**, with cancellation-billing fields.
- `CarePlan.extraCalls` — extra named calls beyond the four standard slots.
- **Auto-cancel on discharge/death:** discharging or marking a client deceased cancels all their future visits; hospitalisation closes/opens periods and restores visits on return; `topUpPermanentSeries` stops generating calls for discharged/deceased clients.

**Call logs**
- New **"missing" mode** listing visits with no call log; add-a-note; branded printing.

**Reports & Settings**
- **Client Database** report tab with per-site Excel export + branded, printable Crib Sheet (letterhead).
- **Audit Log** tab in Settings with date-range + free-text filters (`/api/audit` filtered query, up to 10,000 rows).
- Supported-living / housing-provider fields in org & site settings.

**Company branding for printouts** *(cross-cutting)*
- `printBranding` lib + **PrintBrandingHeader**: every printable form (Emergency Grab Sheet, MAR, Contract of Care, Support Plan, Crib Sheet, Risk Assessments) carries the company letterhead (name/logo/address, CQC/ICO numbers) instead of a hard-coded identity.

**Permissions & auth**
- **Per-person permission override:** `User.permissionsOverride` now takes precedence (`override > custom role > base-role matrix`) — in the sandbox an individual grant never reached the user's session.

**Timesheets**
- Managers can create/edit clock records (`clock.updateRecord` / `createRecord`).

**Email reliability**
- `sendEmail` returns a boolean so callers surface real delivery failures; password-reset returns 502 if the email didn't send (instead of a false "sent"). `siblingUrl` derives carer/family app URLs from `CLIENT_URL` when per-app env vars are unset.

**Carer app (misc)**
- **"Still clocked in" sticky notification** — pinned while clocked in, re-pinned on app open, cleared on clock-out; active call stays on Today even after date rollover (authoritative `/clock/status`).
- **Service-user detail enrichments:** `preferredName`, a highlighted **Property Access** card (key safe, meds safe code), expanded emergency contact (+mobile), Next of Kin, GP & Pharmacy — with tap-to-dial `tel:` links.
- **Meds stay reviewable after the call** (`/clock/shift-meds/:shiftId`).
- Hours/shifts window widened (8 weeks back … 2 ahead); history sorted by day then start-time (fixes same-day jumbling).

**Shared UI**
- New reusable **SearchableSelect** and **SingleSelectDropdown** controls.
- `ensureColumns` auto-provisions all the new tables/columns above (migration-free deploys).

---

## 3. For awareness — things only in the sandbox (NOT in production)

Out of scope for this request, but worth knowing the sandbox is *not* a strict subset:
- Council **Submission** archive (`submissions` route/controller), visit refs/flags (`visitRef.ts`, `refCounter.ts`), clock-override audit + `ClockEditModal`, service-level/area export, `careRounds.ts`, `areas.ts`, a Weekly Summary page, route-level lazy-loading, an experimental "Option B" layout toggle.
- Production **removed** the sandbox's "report frustrated visit" feature (`reportFrustrated`, `frustrated`/`ecmNote`).

If you ever decide to port features from Caremid into Caremid Solutions, work top-down from section 1 (the whole modules) — and remember each carries schema changes that `ensureColumns` will add automatically on the sandbox's next deploy.

# Service-User Billing — Design

Billing system for **care providers to invoice their funders** (councils / private
clients) for care delivered to service users. This is the revenue side and is
**separate from** the SaaS subscription billing (how Caremid itself is sold).

> Status: **design / not yet built.** No code written until explicitly approved.

## Locked decisions (v1)

| Decision | Choice |
|---|---|
| Billing basis | **Scheduled hours** (`Shift.startTime`→`endTime`), not clocked hours |
| Billing unit | **Per hour** (rate × scheduled hours) |
| Split funding | **Schema supports multiple funders per service user; v1 ships single-funder.** Split allocation UI deferred to phase 3 |
| Invoice output | **PDF + CSV** |

Key principle: **charge rate ≠ pay rate.** `User.hourlyRate` /
`OrgSettings.defaultHourlyRate` are carer *pay* (cost). Billing introduces its own
*charge* rate (revenue). Never reuse the pay rate.

## The chain

```
Shift (scheduled care) → resolve service user's Funder + charge rate
  → InvoiceLine → Invoice (to Council / Private payer) → Sent → Paid
```

Left side already exists (`Shift`, `ServiceUser`, `Site`). Missing: who pays, at
what rate, and the invoice objects.

## Data model (new Prisma models)

```
Funder                       // a council, private payer, or NHS body
  id, name, type (COUNCIL | PRIVATE | NHS_CHC)
  billingAddress, contactName, email, phone
  paymentTermsDays (default 30), poReference, vatExempt (default true), notes

FundingArrangement           // service user ↔ funder, with rate (split-ready)
  id, serviceUserId, funderId
  billingUnit (PER_HOUR)     // v1 = PER_HOUR; enum leaves room for PER_VISIT/WEEKLY_BLOCK
  rate                       // flat charge £/hr (rateCard deferred to phase 3)
  allocation (ALL)           // v1 = ALL; enum leaves room for PERCENTAGE/HOURS_CAP/VISIT_TYPES
  allocationValue?           // unused in v1
  startDate, endDate?        // funding periods
  poNumber, contractRef

Invoice
  id, funderId, number, periodStart, periodEnd
  status (DRAFT | SENT | PAID | PART_PAID | VOID)
  issueDate, dueDate, subtotal, vat, total, poNumber, notes

InvoiceLine
  id, invoiceId, serviceUserId, date, description
  quantity (hours), unitRate, amount
  sourceShiftId              // traceability + prevents double-billing

Payment                      // phase 4
  id, invoiceId, amount, date, method, reference
```

Existing-model change: add `billedInvoiceLineId?` to **`Shift`** so a scheduled
visit can only be billed once.

## Invoice generation flow

1. Select a funder + date range.
2. Gather scheduled shifts in range for service users funded by that funder,
   excluding those already billed (`billedInvoiceLineId == null`).
3. Per shift: hours = endTime − startTime; rate = active FundingArrangement.rate;
   amount = hours × rate. Flag shifts with no active arrangement.
4. Build a **DRAFT** invoice with editable line items.
5. Finalise → assign invoice number, lock lines, set `billedInvoiceLineId` on
   each source shift.
6. Output PDF (org logo/letterhead) + CSV of line items.
7. Mark Sent → record Payment(s) → Paid; aged-debt reporting.

## UI surfaces

- **Service user profile → Funding tab**: funder, charge rate, PO, dates.
- **Funders page**: manage councils + private payers (mirrors the Sites page).
- **Billing → Invoices**: generate, review drafts, list, PDF/CSV, mark paid.
- **Reports**: revenue by funder, unbilled/uninvoiced care, aged debtors.

## Deferred / out of scope for v1
- Split-funding allocation (%, hours cap, visit-type) — schema ready, UI in phase 3.
- Rate cards (weekday/weekend/bank-holiday and per-visit-type enhanced rates) — phase 3.
- Per-visit / weekly-block billing units — enum ready, not wired.
- Payments + aged-debt reporting — phase 4.
- Cancelled/missed-visit charging policy, credit notes, travel/mileage.

## Edge cases to settle before/within relevant phases
- Cancelled/missed visits: do funders pay for short-notice cancellations?
- Bank-holiday enhanced rates (needs England & Wales BH calendar) — phase 3.
- VAT: domestic care usually exempt; `vatExempt` default true, flag retained.
- Rounding rules (per council).

## Multi-tenancy note
All new models are tenant-owned. In the later subscription/multi-tenant conversion
they receive `organizationId` in the same sweep as every other model. Names and
invoice numbers are unique **per org**, never globally — designed to retrofit
cleanly.

## Build order (when approved)
1. Funding model + service-user Funding tab (assign funder + flat rate; no invoicing).
2. Invoice generation from scheduled hours → draft → review → PDF + CSV. **Core value.**
3. Rate cards + split funding.
4. Payments, statuses, aged-debt reports.

import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { runWithoutScope } from '../lib/tenantContext';
import { hasAccess } from '../lib/subscription';

// Everything here is cross-company, so it runs unscoped (platform owner only).

// List every company with headline status + counts. Supports ?status= and ?q=.
export async function listCompanies(req: AuthRequest, res: Response) {
  const statusFilter = (req.query.status as string) || 'all'; // all|trialing|active|lapsed
  const q = ((req.query.q as string) || '').toLowerCase().trim();

  const companies = await runWithoutScope(() =>
    prisma.company.findMany({ orderBy: { createdAt: 'desc' } }),
  );

  // Per-company staff / service-user counts in two grouped queries.
  const [staffCounts, suCounts] = await runWithoutScope(() =>
    Promise.all([
      prisma.user.groupBy({ by: ['companyId'], where: { active: true }, _count: { _all: true } }),
      prisma.serviceUser.groupBy({ by: ['companyId'], _count: { _all: true } }),
    ]),
  );
  const staffBy = new Map(staffCounts.map((r) => [r.companyId, r._count._all]));
  const suBy = new Map(suCounts.map((r) => [r.companyId, r._count._all]));

  // Who to contact. Signup records the person who created the company — their
  // name and email are the only contact details Caremid ever collects — and
  // this page had no way to reach them, so a new trial arrived with nobody to
  // welcome. The FIRST admin is the signer-up: later admins are staff they
  // added themselves.
  const admins = await runWithoutScope(() =>
    prisma.user.findMany({
      where: { role: 'ADMIN', active: true },
      select: { companyId: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  );
  const ownerBy = new Map<string, { name: string; email: string; phone: string | null }>();
  for (const a of admins) {
    if (!a.companyId || ownerBy.has(a.companyId)) continue;
    ownerBy.set(a.companyId, { name: `${a.firstName} ${a.lastName}`.trim(), email: a.email, phone: a.phone ?? null });
  }

  let rows = companies.map((c) => {
    const access = hasAccess(c);
    // A "lapsed" company had a trial/sub that is no longer valid.
    const lapsed = !access || !c.active;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      subscriptionStatus: c.subscriptionStatus,
      active: c.active,
      plan: c.plan,
      trialEndsAt: c.trialEndsAt,
      currentPeriodEnd: c.currentPeriodEnd,
      hasAccess: access,
      lapsed,
      staff: staffBy.get(c.id) ?? 0,
      serviceUsers: suBy.get(c.id) ?? 0,
      createdAt: c.createdAt,
      owner: ownerBy.get(c.id) ?? null,
    };
  });

  if (statusFilter === 'trialing') rows = rows.filter((r) => r.subscriptionStatus === 'TRIALING' && r.hasAccess);
  else if (statusFilter === 'active') rows = rows.filter((r) => r.subscriptionStatus === 'ACTIVE');
  else if (statusFilter === 'lapsed') rows = rows.filter((r) => r.lapsed);
  // Search the contact too — chasing a trial usually starts from a name or an
  // email in an inbox, not from the company's slug.
  if (q) {
    rows = rows.filter((r) => r.name.toLowerCase().includes(q)
      || r.slug.includes(q)
      || (r.owner?.name ?? '').toLowerCase().includes(q)
      || (r.owner?.email ?? '').toLowerCase().includes(q));
  }

  // Headline metrics computed over ALL companies (ignore filters).
  const all = companies.map((c) => ({ status: c.subscriptionStatus, access: hasAccess(c), active: c.active }));
  const metrics = {
    total: all.length,
    trialing: all.filter((c) => c.status === 'TRIALING' && c.access).length,
    active: all.filter((c) => c.status === 'ACTIVE').length,
    lapsed: all.filter((c) => !c.access || !c.active).length,
  };

  res.json({ metrics, companies: rows });
}

async function updateCompany(id: string, data: Record<string, unknown>) {
  return runWithoutScope(() => prisma.company.update({ where: { id }, data }));
}

// Suspend / un-suspend a company at the platform level (data preserved).
export async function setCompanyActive(req: AuthRequest, res: Response) {
  const active = req.body?.active !== false;
  const c = await updateCompany(req.params.id, { active });
  res.json({ id: c.id, active: c.active });
}

// Extend (or set) a company's trial by N days from now, marking it TRIALING.
export async function extendTrial(req: AuthRequest, res: Response) {
  const days = Math.max(1, Math.min(365, Number(req.body?.days) || 14));
  const trialEndsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const c = await updateCompany(req.params.id, { trialEndsAt, subscriptionStatus: 'TRIALING', active: true });
  res.json({ id: c.id, subscriptionStatus: c.subscriptionStatus, trialEndsAt: c.trialEndsAt });
}

// End a company's trial immediately (locks them out until they subscribe).
export async function endTrial(req: AuthRequest, res: Response) {
  const c = await updateCompany(req.params.id, { trialEndsAt: new Date(Date.now() - 1000) });
  res.json({ id: c.id, trialEndsAt: c.trialEndsAt });
}

// Comp a company free access (mark ACTIVE without Stripe) — for partners/staff.
export async function compSubscription(req: AuthRequest, res: Response) {
  const c = await updateCompany(req.params.id, { subscriptionStatus: 'ACTIVE', active: true });
  res.json({ id: c.id, subscriptionStatus: c.subscriptionStatus });
}

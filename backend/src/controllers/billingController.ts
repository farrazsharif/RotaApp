import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { runWithoutScope } from '../lib/tenantContext';
import { stripe, stripeConfigured, PRICE_IDS, STRIPE_WEBHOOK_SECRET, billingReturnUrl } from '../lib/stripe';
import { hasAccess } from '../lib/subscription';
import type Stripe from 'stripe';

// Company rows are not tenant-scoped, but we still fetch/update them through the
// unscoped path for clarity and to avoid any accidental filtering.
function getCompany(id: string) {
  return runWithoutScope(() => prisma.company.findUnique({ where: { id } }));
}

// Active, chargeable carers/staff drive the PER_SEAT quantity.
function countSeats(companyId: string) {
  return runWithoutScope(() => prisma.user.count({ where: { companyId, active: true } }));
}

// Billing summary for the settings page.
export async function getBillingStatus(req: AuthRequest, res: Response) {
  const company = await getCompany(req.user!.companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });
  const seats = await countSeats(company.id);
  res.json({
    configured: stripeConfigured,
    plan: company.plan,
    subscriptionStatus: company.subscriptionStatus,
    trialEndsAt: company.trialEndsAt,
    currentPeriodEnd: company.currentPeriodEnd,
    hasAccess: hasAccess(company),
    seats,
    hasSubscription: !!company.stripeSubscriptionId,
  });
}

// Starts a Stripe Checkout session to subscribe to the chosen plan.
export async function createCheckoutSession(req: AuthRequest, res: Response) {
  if (!stripeConfigured) return res.status(503).json({ error: 'Billing is not configured yet' });
  const plan = (req.body?.plan as string) === 'PER_SEAT' ? 'PER_SEAT' : 'FLAT';
  const priceId = PRICE_IDS[plan];
  if (!priceId) return res.status(503).json({ error: `No price configured for the ${plan} plan` });

  const company = await getCompany(req.user!.companyId);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  // Reuse or create the Stripe customer for this company.
  let customerId = company.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: company.name,
      email: req.user!.email,
      metadata: { companyId: company.id },
    });
    customerId = customer.id;
    await runWithoutScope(() => prisma.company.update({ where: { id: company.id }, data: { stripeCustomerId: customerId } }));
  }

  const quantity = plan === 'PER_SEAT' ? Math.max(1, await countSeats(company.id)) : 1;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    // If still trialing, honour the remaining trial days in Stripe too.
    subscription_data:
      company.subscriptionStatus === 'TRIALING' && company.trialEndsAt && company.trialEndsAt.getTime() > Date.now()
        ? { trial_end: Math.floor(company.trialEndsAt.getTime() / 1000) }
        : undefined,
    success_url: billingReturnUrl('/settings/billing?checkout=success'),
    cancel_url: billingReturnUrl('/settings/billing?checkout=cancelled'),
    metadata: { companyId: company.id, plan },
  });

  res.json({ url: session.url });
}

// Opens the Stripe Billing Portal so a customer can manage/cancel their plan.
export async function createPortalSession(req: AuthRequest, res: Response) {
  if (!stripeConfigured) return res.status(503).json({ error: 'Billing is not configured yet' });
  const company = await getCompany(req.user!.companyId);
  if (!company?.stripeCustomerId) return res.status(400).json({ error: 'No billing account yet' });

  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: billingReturnUrl(),
  });
  res.json({ url: session.url });
}

// Maps a Stripe subscription onto our Company record.
async function syncSubscription(sub: Stripe.Subscription) {
  const companyId = (sub.metadata?.companyId as string) || undefined;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const company = companyId
    ? await getCompany(companyId)
    : await runWithoutScope(() => prisma.company.findFirst({ where: { stripeCustomerId: customerId } }));
  if (!company) return;

  const item = sub.items.data[0];
  const priceId = item?.price?.id;
  const plan = priceId && priceId === PRICE_IDS.PER_SEAT ? 'PER_SEAT' : 'FLAT';
  // Stripe status → our vocabulary.
  const map: Record<string, string> = {
    trialing: 'TRIALING', active: 'ACTIVE', past_due: 'PAST_DUE',
    canceled: 'CANCELED', unpaid: 'PAST_DUE', incomplete: 'INCOMPLETE',
    incomplete_expired: 'CANCELED', paused: 'CANCELED',
  };
  const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;

  await runWithoutScope(() =>
    prisma.company.update({
      where: { id: company.id },
      data: {
        stripeSubscriptionId: sub.id,
        stripeCustomerId: customerId,
        stripePriceId: priceId ?? null,
        plan,
        subscriptionStatus: map[sub.status] ?? 'INCOMPLETE',
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        seats: plan === 'PER_SEAT' ? item?.quantity ?? null : null,
      },
    }),
  );
}

// Stripe webhook — mounted with a raw body parser (see index.ts).
export async function handleWebhook(req: Request, res: Response) {
  if (!stripeConfigured || !STRIPE_WEBHOOK_SECRET) return res.status(503).end();
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${(err as Error).message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          if (!sub.metadata?.companyId && session.metadata?.companyId) {
            sub.metadata = { ...sub.metadata, companyId: session.metadata.companyId };
          }
          await syncSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', (err as Error).message);
    return res.status(500).end();
  }

  res.json({ received: true });
}

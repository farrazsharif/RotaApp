import Stripe from 'stripe';

// Billing is optional: if no secret key is configured the app still runs
// (trials work, the billing UI shows "not configured"). Set the env vars to
// switch it on. Mirrors the push-notifications "configured" pattern.
export const stripeConfigured = !!process.env.STRIPE_SECRET_KEY;

export const stripe = stripeConfigured
  ? new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-06-24.dahlia' })
  : (null as unknown as Stripe);

// The two plans on offer. Each maps to a Stripe Price created in the dashboard.
//   FLAT     → a fixed monthly price (licensed, quantity 1)
//   PER_SEAT → a per-unit monthly price, quantity = active carer count
export const PRICE_IDS: Record<'FLAT' | 'PER_SEAT', string | undefined> = {
  FLAT: process.env.STRIPE_PRICE_FLAT,
  PER_SEAT: process.env.STRIPE_PRICE_PER_SEAT,
};

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Where Stripe Checkout / Billing Portal send the user back to.
export function billingReturnUrl(path = '/settings/billing'): string {
  const base = process.env.CLIENT_URL || 'http://localhost:5173';
  return `${base}${path}`;
}

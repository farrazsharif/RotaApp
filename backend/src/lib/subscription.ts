// Whether a company currently has product access: paying (ACTIVE / PAST_DUE
// grace) or still within its trial window. Shared by the auth gate and the
// billing controller so the rule lives in one place.
export function hasAccess(company: { subscriptionStatus: string; trialEndsAt: Date | null }): boolean {
  const s = company.subscriptionStatus;
  if (s === 'ACTIVE' || s === 'PAST_DUE') return true; // PAST_DUE = short grace period
  if (s === 'TRIALING') return !company.trialEndsAt || company.trialEndsAt.getTime() > Date.now();
  return false;
}

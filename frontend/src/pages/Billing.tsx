import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { billingApi } from '../api/billing';

function daysLeft(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function Billing() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['billing-status'], queryFn: billingApi.status });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function subscribe(plan: 'FLAT' | 'PER_SEAT') {
    setError(''); setBusy(plan);
    try {
      const { url } = await billingApi.checkout(plan);
      window.location.href = url;
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || 'Could not start checkout.');
      setBusy(null);
    }
  }

  async function manage() {
    setError(''); setBusy('portal');
    try {
      const { url } = await billingApi.portal();
      window.location.href = url;
    } catch (e: unknown) {
      setError((e as { response?: { data?: { error?: string } } }).response?.data?.error || 'Could not open billing portal.');
      setBusy(null);
    }
  }

  if (isLoading || !data) {
    return <div className="p-6"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  }

  const trialing = data.subscriptionStatus === 'TRIALING';
  const active = data.subscriptionStatus === 'ACTIVE';
  const locked = !data.hasAccess;
  const trialDays = daysLeft(data.trialEndsAt);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Billing &amp; subscription</h1>
        <p className="text-gray-500 mt-1">Manage your Caremid plan.</p>
      </div>

      {/* Current status banner */}
      <div className={`rounded-xl border p-5 ${locked ? 'bg-red-50 border-red-200' : active ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
        {locked ? (
          <div>
            <p className="font-semibold text-red-800">Your trial has ended</p>
            <p className="text-red-700 text-sm mt-1">Choose a plan below to keep using Caremid. Your data is safe and waiting.</p>
          </div>
        ) : active ? (
          <div>
            <p className="font-semibold text-green-800">Subscription active — {data.plan === 'PER_SEAT' ? 'Per carer/staff' : 'Flat monthly'}</p>
            <p className="text-green-700 text-sm mt-1">Next billing date: {fmtDate(data.currentPeriodEnd)}{data.plan === 'PER_SEAT' ? ` · ${data.seats} carer${data.seats === 1 ? '' : 's'}` : ''}</p>
          </div>
        ) : trialing ? (
          <div>
            <p className="font-semibold text-blue-800">Free trial — {trialDays} day{trialDays === 1 ? '' : 's'} left</p>
            <p className="text-blue-700 text-sm mt-1">Trial ends {fmtDate(data.trialEndsAt)}. Subscribe any time to continue without interruption.</p>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-blue-800">Status: {data.subscriptionStatus}</p>
          </div>
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {!data.configured && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg text-sm">
          Online payments are not switched on for this environment yet. Plans will become purchasable once Stripe is configured.
        </div>
      )}

      {/* Plan cards — hidden once actively subscribed (manage via portal instead) */}
      {!active && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-gray-200 p-6 flex flex-col">
            <h3 className="font-semibold text-gray-800">Flat monthly</h3>
            <p className="text-gray-500 text-sm mt-1">One fixed price, your whole team included.</p>
            <div className="mt-auto pt-6">
              <button
                onClick={() => subscribe('FLAT')}
                disabled={!data.configured || busy !== null}
                className="btn-primary btn w-full py-2.5 disabled:opacity-50"
              >
                {busy === 'FLAT' ? 'Redirecting…' : 'Choose flat monthly'}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 p-6 flex flex-col">
            <h3 className="font-semibold text-gray-800">Per carer / staff</h3>
            <p className="text-gray-500 text-sm mt-1">Pay for what you use — scales with your team ({data.seats} active now).</p>
            <div className="mt-auto pt-6">
              <button
                onClick={() => subscribe('PER_SEAT')}
                disabled={!data.configured || busy !== null}
                className="btn-primary btn w-full py-2.5 disabled:opacity-50"
              >
                {busy === 'PER_SEAT' ? 'Redirecting…' : 'Choose per carer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage existing subscription */}
      {data.hasSubscription && (
        <div className="flex items-center gap-3">
          <button onClick={manage} disabled={busy !== null} className="btn border border-gray-300 bg-white hover:bg-gray-50 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
            {busy === 'portal' ? 'Opening…' : 'Manage billing & invoices'}
          </button>
          <button onClick={() => refetch()} className="text-sm text-blue-600 hover:text-blue-700">Refresh status</button>
        </div>
      )}
    </div>
  );
}

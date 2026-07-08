import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { platformApi, PlatformCompany } from '../api/platform';

type StatusFilter = 'all' | 'trialing' | 'active' | 'lapsed';

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function StatusBadge({ c }: { c: PlatformCompany }) {
  let label: string = c.subscriptionStatus;
  let cls = 'bg-gray-100 text-gray-700';
  if (!c.active) { label = 'SUSPENDED'; cls = 'bg-gray-800 text-white'; }
  else if (c.lapsed) { label = 'LAPSED'; cls = 'bg-red-100 text-red-700'; }
  else if (c.subscriptionStatus === 'ACTIVE') { cls = 'bg-green-100 text-green-700'; }
  else if (c.subscriptionStatus === 'TRIALING') { label = 'TRIAL'; cls = 'bg-blue-100 text-blue-700'; }
  else if (c.subscriptionStatus === 'PAST_DUE') { cls = 'bg-amber-100 text-amber-700'; }
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className={`text-2xl font-bold ${tone || 'text-gray-900'}`}>{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}

export default function Platform() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['platform-companies', status, q],
    queryFn: () => platformApi.list({ status, q: q || undefined }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['platform-companies'] });
  const setActive = useMutation({ mutationFn: (v: { id: string; active: boolean }) => platformApi.setActive(v.id, v.active), onSuccess: invalidate });
  const extend = useMutation({ mutationFn: (id: string) => platformApi.extendTrial(id, 14), onSuccess: invalidate });
  const endTrial = useMutation({ mutationFn: (id: string) => platformApi.endTrial(id), onSuccess: invalidate });
  const comp = useMutation({ mutationFn: (id: string) => platformApi.comp(id), onSuccess: invalidate });

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'trialing', label: 'On trial' },
    { key: 'active', label: 'Active' },
    { key: 'lapsed', label: 'Lapsed' },
  ];

  return (
    <div className="space-y-6 p-1">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform admin</h1>
        <p className="text-gray-500 mt-1">Every company on Caremid — trials, subscriptions and usage.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Total companies" value={data?.metrics.total ?? 0} />
        <Metric label="On free trial" value={data?.metrics.trialing ?? 0} tone="text-blue-600" />
        <Metric label="Active (paying)" value={data?.metrics.active ?? 0} tone="text-green-600" />
        <Metric label="Lapsed / suspended" value={data?.metrics.lapsed ?? 0} tone="text-red-600" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${status === f.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
          >
            {f.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search company…"
          className="input ml-auto max-w-xs"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Trial / renews</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Staff</th>
              <th className="px-4 py-3 font-medium">Clients</th>
              <th className="px-4 py-3 font-medium">Joined</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
            )}
            {data?.companies.length === 0 && !isLoading && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No companies match.</td></tr>
            )}
            {data?.companies.map((c) => {
              const dl = c.subscriptionStatus === 'TRIALING' ? daysLeft(c.trialEndsAt) : null;
              const busy = setActive.isPending || extend.isPending || endTrial.isPending || comp.isPending;
              return (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{c.name}</div>
                    <div className="text-xs text-gray-400">{c.slug}</div>
                  </td>
                  <td className="px-4 py-3"><StatusBadge c={c} /></td>
                  <td className="px-4 py-3 text-gray-600">
                    {c.subscriptionStatus === 'TRIALING'
                      ? <>{fmtDate(c.trialEndsAt)}{dl !== null && <span className={`ml-1 text-xs ${dl < 0 ? 'text-red-500' : 'text-gray-400'}`}>({dl < 0 ? 'ended' : `${dl}d left`})</span>}</>
                      : c.subscriptionStatus === 'ACTIVE' ? fmtDate(c.currentPeriodEnd) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.plan === 'PER_SEAT' ? 'Per carer' : 'Flat'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.staff}</td>
                  <td className="px-4 py-3 text-gray-600">{c.serviceUsers}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(c.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 justify-end">
                      <button disabled={busy} onClick={() => extend.mutate(c.id)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100" title="Extend trial by 14 days">+14d trial</button>
                      {c.subscriptionStatus === 'TRIALING' && (
                        <button disabled={busy} onClick={() => endTrial.mutate(c.id)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100">End trial</button>
                      )}
                      {c.subscriptionStatus !== 'ACTIVE' && (
                        <button disabled={busy} onClick={() => comp.mutate(c.id)} className="text-xs px-2 py-1 rounded border border-green-200 text-green-700 hover:bg-green-50" title="Give free access">Comp</button>
                      )}
                      <button disabled={busy} onClick={() => setActive.mutate({ id: c.id, active: !c.active })} className={`text-xs px-2 py-1 rounded border ${c.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-gray-200 hover:bg-gray-100'}`}>
                        {c.active ? 'Suspend' : 'Unsuspend'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

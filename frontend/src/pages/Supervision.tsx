import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, differenceInCalendarDays, differenceInWeeks } from 'date-fns';
import { supervisionApi } from '../api/supervision';
import SpotCheckModal from '../components/SpotCheckModal';
import Reviews from './Reviews';

const TABS = ['Overview', 'Reviews'] as const;
type Tab = typeof TABS[number];

function Tile({ n, label, tone }: { n: number; label: string; tone: 'danger' | 'warning' | 'accent' }) {
  const map = {
    danger: 'bg-red-50 text-red-700',
    warning: 'bg-amber-50 text-amber-700',
    accent: 'bg-blue-50 text-blue-700',
  } as const;
  return (
    <div className={`rounded-lg px-4 py-3 ${map[tone]}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-xs mt-0.5">{label}</div>
    </div>
  );
}

function dueLabel(dateStr: string, overdue: boolean): { text: string; danger: boolean } {
  const d = new Date(dateStr);
  if (overdue) return { text: `Overdue ${Math.abs(differenceInCalendarDays(d, new Date()))}d`, danger: true };
  const days = differenceInCalendarDays(d, new Date());
  return { text: days <= 0 ? 'Due today' : `In ${days}d`, danger: days <= 3 };
}

function Overview() {
  const { data, isLoading } = useQuery({ queryKey: ['supervision-summary'], queryFn: supervisionApi.summary });
  const [newFor, setNewFor] = useState<string | 'any' | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);

  if (isLoading || !data) {
    return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;
  }

  const riskOverdue = data.risk.items.filter((i) => i.overdue).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Carers are spot-checked every {data.intervalMonths} months.</p>
        <button className="btn-primary btn" onClick={() => setNewFor('any')}>+ New spot check</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Tile n={riskOverdue} label="Risk assessments overdue" tone="danger" />
        <Tile n={data.reviews.dueCount} label="Reviews due soon" tone="warning" />
        <Tile n={data.spotChecks.dueCount} label="Spot checks due" tone="accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">Spot checks due</h2>
          {data.spotChecks.items.length === 0 ? (
            <p className="text-sm text-gray-400">Everyone's up to date.</p>
          ) : (
            <div className="space-y-2">
              {data.spotChecks.items.map((c) => (
                <div key={c.carerId} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-2.5">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{c.carerName}</p>
                    <p className="text-xs text-gray-500">{c.lastCheck ? `Last checked ${differenceInWeeks(new Date(), new Date(c.lastCheck))} weeks ago` : 'Never checked'}</p>
                  </div>
                  <button className="btn-secondary btn btn-sm" onClick={() => setNewFor(c.carerId)}>Spot check</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card space-y-3">
          <h2 className="font-semibold text-gray-900">Reviews &amp; risk assessments</h2>
          {data.reviews.items.length === 0 && data.risk.items.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing due in the next 30 days.</p>
          ) : (
            <div className="space-y-2">
              {data.risk.items.map((r) => {
                const d = dueLabel(r.dueDate, r.overdue);
                return (
                  <Link key={`risk-${r.serviceUserId}`} to={`/service-users/${r.serviceUserId}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-2.5 hover:bg-gray-50">
                    <div><p className="text-sm font-medium text-gray-900">{r.serviceUserName}</p><p className="text-xs text-gray-500">Care plan / risk review</p></div>
                    <span className={`text-xs px-2 py-1 rounded-full ${d.danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{d.text}</span>
                  </Link>
                );
              })}
              {data.reviews.items.map((r) => {
                const d = dueLabel(r.dueDate, r.overdue);
                return (
                  <Link key={`rev-${r.id}`} to={`/service-users/${r.serviceUserId}`} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 p-2.5 hover:bg-gray-50">
                    <div><p className="text-sm font-medium text-gray-900">{r.serviceUserName}</p><p className="text-xs text-gray-500">Service review</p></div>
                    <span className={`text-xs px-2 py-1 rounded-full ${d.danger ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{d.text}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Recent spot checks</h2>
        {data.recentSpotChecks.length === 0 ? (
          <p className="text-sm text-gray-400">No spot checks recorded yet.</p>
        ) : (
          <div className="divide-y">
            {data.recentSpotChecks.map((r) => (
              <button key={r.id} onClick={() => setViewId(r.id)} className="w-full flex items-center justify-between gap-3 py-2.5 text-left hover:bg-gray-50 px-1 -mx-1 rounded">
                <div><p className="text-sm font-medium text-gray-900">{r.carerName}</p><p className="text-xs text-gray-500">{format(new Date(r.date), 'dd MMM yyyy')}</p></div>
                <span className={`text-xs px-2 py-1 rounded-full ${r.concerns > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'}`}>{r.concerns > 0 ? `${r.concerns} concern${r.concerns === 1 ? '' : 's'}` : 'No concerns'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {newFor && <SpotCheckModal onClose={() => setNewFor(null)} carerId={newFor === 'any' ? undefined : newFor} />}
      {viewId && <SpotCheckModal onClose={() => setViewId(null)} viewId={viewId} />}
    </div>
  );
}

export default function Supervision() {
  const [tab, setTab] = useState<Tab>('Overview');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Supervision</h1>

      <div className="border-b border-gray-200">
        <nav className="flex flex-wrap gap-1 -mb-px">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'Overview' && <Overview />}
      {tab === 'Reviews' && <Reviews embedded />}
    </div>
  );
}

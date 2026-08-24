import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { format, differenceInCalendarDays } from 'date-fns';
import { supervisionApi } from '../api/supervision';
import SpotCheckModal from '../components/SpotCheckModal';
import PaperSeedModal from '../components/PaperSeedModal';
import Reviews from './Reviews';
import StaffSupervisions from './StaffSupervisions';

const TABS = ['Overview', 'Reviews', 'Spot checks', 'Supervisions'] as const;
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

function Loading() {
  return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;
}

function Overview() {
  const { data, isLoading } = useQuery({ queryKey: ['supervision-summary'], queryFn: supervisionApi.summary });
  if (isLoading || !data) return <Loading />;
  const riskOverdue = data.risk.items.filter((i) => i.overdue).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Tile n={riskOverdue} label="Risk assessments overdue" tone="danger" />
        <Tile n={data.reviews.dueCount} label="Reviews due soon" tone="warning" />
        <Tile n={data.spotChecks.dueCount} label="Spot checks due" tone="accent" />
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-900">Reviews &amp; risk assessments due</h2>
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
  );
}

function SpotChecks() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['supervision-summary'], queryFn: supervisionApi.summary });
  const [newFor, setNewFor] = useState<string | 'any' | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [paperFor, setPaperFor] = useState<{ carerId: string; carerName: string } | null>(null);

  const deleteMut = useMutation({
    mutationFn: (id: string) => supervisionApi.deleteSpotCheck(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supervision-summary'] }); setConfirmDelete(null); },
  });

  if (isLoading || !data) return <Loading />;

  const rows = data.spotChecks.rows;
  const due = rows.filter((r) => r.due);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">Carers are spot-checked every {data.intervalMonths} months.</p>
        <button className="btn-primary btn" onClick={() => setNewFor('any')}>+ New spot check</button>
      </div>

      {due.length > 0 && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          <p className="font-semibold mb-1">⚠ {due.length} spot check{due.length > 1 ? 's' : ''} due</p>
          <ul className="list-disc list-inside space-y-0.5">
            {due.map((r) => (
              <li key={r.carerId}>{r.carerName} — {r.nextDue ? `next check was due ${format(new Date(r.nextDue), 'dd MMM yyyy')}` : 'never checked'}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="card text-center py-12 text-gray-400"><p>No active carers to spot-check.</p></div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Checked</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Next Due</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Result</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Observer</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const overdays = r.nextDue ? differenceInCalendarDays(new Date(), new Date(r.nextDue)) : null;
                return (
                  <tr key={r.carerId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.carerName}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.lastCheck ? format(new Date(r.lastCheck), 'dd MMM yyyy') : <span className="text-gray-300">Never</span>}
                      {r.lastSource === 'paper' && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Paper</span>}
                    </td>
                    <td className="px-4 py-3">
                      {r.due ? (
                        <span className="badge-red badge">⚠ {overdays === null ? 'Never checked' : overdays > 0 ? `Overdue ${overdays}d` : 'Due today'}</span>
                      ) : (
                        <span className="text-gray-600">{r.nextDue ? format(new Date(r.nextDue), 'dd MMM yyyy') : '—'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.concerns === null ? <span className="text-gray-300">—</span> :
                        <span className={`text-xs px-2 py-1 rounded-full ${r.concerns > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'}`}>{r.concerns > 0 ? `${r.concerns} concern${r.concerns === 1 ? '' : 's'}` : 'No concerns'}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.observerName || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {confirmDelete && confirmDelete === r.lastCheckId ? (
                        <span className="flex items-center gap-2 justify-end">
                          <span className="text-xs text-red-700">Delete last?</span>
                          <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(r.lastCheckId!)}>Yes</button>
                          <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                        </span>
                      ) : (
                        <span className="flex gap-2 justify-end items-center">
                          <button className={`${r.due ? 'btn-primary' : 'btn-secondary'} btn btn-sm whitespace-nowrap`} onClick={() => setNewFor(r.carerId)}>Spot check</button>
                          {!r.lastCheckId && (
                            <button className="btn-secondary btn btn-sm whitespace-nowrap" title="Log a spot check already done on paper" onClick={() => setPaperFor({ carerId: r.carerId, carerName: r.carerName })}>📄 Paper</button>
                          )}
                          {r.lastCheckId && <button className="btn-secondary btn btn-sm" onClick={() => setViewId(r.lastCheckId)}>View</button>}
                          {r.lastCheckId && <button className="text-xs text-red-600 hover:underline" onClick={() => setConfirmDelete(r.lastCheckId)}>Delete</button>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {newFor && <SpotCheckModal onClose={() => setNewFor(null)} carerId={newFor === 'any' ? undefined : newFor} />}
      {viewId && <SpotCheckModal onClose={() => setViewId(null)} viewId={viewId} />}
      {paperFor && (
        <PaperSeedModal
          title="Record previous spot check"
          subjectName={paperFor.carerName}
          intro="Seed the schedule from a spot check held on paper"
          dateLabel="Date checked (on paper)"
          personLabel="Observer"
          showNextDue={false}
          intervalMonths={data.intervalMonths}
          onSubmit={({ date, person, note }) => supervisionApi.createSpotCheck({ carerId: paperFor.carerId, date, observerName: person || undefined, generalComments: note || undefined, answers: {}, source: 'paper' })}
          onSaved={() => qc.invalidateQueries({ queryKey: ['supervision-summary'] })}
          onClose={() => setPaperFor(null)}
        />
      )}
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
      {tab === 'Spot checks' && <SpotChecks />}
      {tab === 'Supervisions' && <StaffSupervisions embedded />}
    </div>
  );
}

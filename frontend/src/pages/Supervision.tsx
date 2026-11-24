import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, differenceInCalendarDays } from 'date-fns';
import { supervisionApi } from '../api/supervision';
import { useAuth } from '../contexts/AuthContext';
import SpotCheckModal from '../components/SpotCheckModal';
import SpotCheckHistoryRows from '../components/SpotCheckHistoryRows';
import Icon from '../components/Icon';
import PaperSeedModal from '../components/PaperSeedModal';
import SupervisionWorklist from '../components/SupervisionWorklist';
import Reviews from './Reviews';
import StaffSupervisions from './StaffSupervisions';

const TABS = ['Worklist', 'Service Review', 'Spot checks', 'Supervisions'] as const;
type Tab = typeof TABS[number];

function Loading() {
  return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;
}

function Worklist() {
  const { data, isLoading } = useQuery({ queryKey: ['supervision-summary'], queryFn: supervisionApi.summary });
  if (isLoading || !data) return <Loading />;
  return <SupervisionWorklist worklist={data.worklist ?? []} />;
}

function SpotChecks() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['supervision-summary'], queryFn: supervisionApi.summary });
  const [newFor, setNewFor] = useState<string | 'any' | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [paperFor, setPaperFor] = useState<{ carerId: string; carerName: string } | null>(null);
  const [search, setSearch] = useState('');
  // Which carers have their earlier spot checks showing.
  const [openHistory, setOpenHistory] = useState<Record<string, boolean>>({});

  const deleteMut = useMutation({
    mutationFn: (id: string) => supervisionApi.deleteSpotCheck(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['supervision-summary'] }); qc.invalidateQueries({ queryKey: ['spot-checks'] }); setConfirmDelete(null); },
  });

  if (isLoading || !data) return <Loading />;

  // Alphabetical by carer name, so the list is predictable to scan.
  const byName = (a: { carerName: string }, b: { carerName: string }) =>
    a.carerName.localeCompare(b.carerName, undefined, { sensitivity: 'base' });
  const rows = [...data.spotChecks.rows].sort(byName);

  // Coverage across active carers: up to date (checked, not yet due), overdue
  // (checked but past due), or never spot-checked.
  const scActive = rows.length;
  // A new starter is neither overdue nor a gap: their first check falls due
  // three months after they start, so they are counted separately rather than
  // sitting in amber as though something had been missed.
  const scNewStarter = rows.filter((r) => r.newStarter).length;
  const scNever = rows.filter((r) => !r.lastCheck && !r.newStarter).length;
  const scOverdue = rows.filter((r) => r.lastCheck && r.due).length;
  const scUpToDate = rows.filter((r) => (r.lastCheck && !r.due) || r.newStarter).length;

  // Search filters the table by carer name.
  const q = search.trim().toLowerCase();
  const visibleRows = q ? rows.filter((r) => r.carerName.toLowerCase().includes(q)) : rows;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Carers are spot-checked every {data.intervalMonths} months, the first {data.intervalMonths} months after they start.
          {!!data.spotChecks.outOfScope && (
            // Said out loud. A list that silently drops people invites the
            // question of who, every time somebody counts it against the staff
            // list and gets a different number.
            <> {data.spotChecks.outOfScope} staff member{data.spotChecks.outOfScope === 1 ? '' : 's'} deliver no care (office roles, the owner and the registered manager), so a spot check does not apply to them.</>
          )}
        </p>
        <button className="btn-primary btn" onClick={() => setNewFor('any')}>+ New spot check</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900 tabular-nums">{scActive}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active carers</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-green-600 tabular-nums">{scUpToDate}</div>
          <div className="text-xs text-gray-500 mt-0.5">Up to date</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600 tabular-nums">{scOverdue}</div>
          <div className="text-xs text-gray-500 mt-0.5">Due / overdue</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-amber-600 tabular-nums">{scNever}</div>
          <div className="text-xs text-gray-500 mt-0.5">No spot check yet</div>
        </div>
        {scNewStarter > 0 && (
          <div className="card p-4">
            <div className="text-2xl font-bold text-blue-600 tabular-nums">{scNewStarter}</div>
            <div className="text-xs text-gray-500 mt-0.5">New starter, not yet due</div>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-12 text-gray-400"><p>No active carers to spot-check.</p></div>
      ) : (
        <div className="space-y-3">
          <div className="relative max-w-xs">
            <span className="absolute inset-y-0 left-3 flex items-center text-gray-400 pointer-events-none">🔍</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search carer…"
              className="input pl-9"
              aria-label="Search carers"
            />
          </div>
          <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-medium text-gray-600">Last Checked</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Next Due</th>
                <th className="hidden xl:table-cell text-left px-4 py-3 font-medium text-gray-600">Result</th>
                <th className="hidden xl:table-cell text-left px-4 py-3 font-medium text-gray-600">Observer</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleRows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">No carers match “{search.trim()}”.</td></tr>
              )}
              {visibleRows.map((r) => {
                const overdays = r.nextDue ? differenceInCalendarDays(new Date(), new Date(r.nextDue)) : null;
                return [
                  <tr key={r.carerId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      {r.lastCheckId ? (
                        <button
                          className="flex items-center gap-2 font-medium text-gray-900 hover:text-blue-700"
                          onClick={() => setOpenHistory((o) => ({ ...o, [r.carerId]: !o[r.carerId] }))}
                          title="Show earlier spot checks"
                        >
                          <Icon
                            name="chevron"
                            size={14}
                            className={`text-gray-400 shrink-0 transition-transform duration-150 ${openHistory[r.carerId] ? 'rotate-90' : ''}`}
                          />
                          {r.carerName}
                        </button>
                      ) : (
                        // Indented to line up with the names that do expand.
                        <span className="flex items-center gap-2 font-medium text-gray-900"><span className="w-[14px] shrink-0" />{r.carerName}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.newStarter
                        ? <span className="badge-blue badge">First check {r.nextDue ? format(new Date(r.nextDue), 'dd MMM yyyy') : 'not yet due'}</span>
                        : !r.lastCheck
                        ? <span className="badge-yellow badge">No spot check yet</span>
                        : r.due
                          ? <span className="badge-red badge">Overdue{overdays && overdays > 0 ? ` ${overdays}d` : ''}</span>
                          : <span className="badge-green badge">Up to date</span>}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3 text-gray-600">
                      {r.lastCheck ? format(new Date(r.lastCheck), 'dd MMM yyyy') : <span className="text-gray-300">Never</span>}
                      {r.lastSource === 'paper' && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Paper</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.nextDue ? format(new Date(r.nextDue), 'dd MMM yyyy') : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3">
                      {r.concerns === null ? <span className="text-gray-300">—</span> :
                        <span className={`text-xs px-2 py-1 rounded-full ${r.concerns > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'}`}>{r.concerns > 0 ? `${r.concerns} concern${r.concerns === 1 ? '' : 's'}` : 'No concerns'}</span>}
                    </td>
                    <td className="hidden xl:table-cell px-4 py-3 text-gray-600">{r.observerName || '—'}</td>
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
                          {isAdmin && !r.lastCheckId && (
                            <button className="btn-secondary btn btn-sm whitespace-nowrap" title="Log a spot check already done on paper" onClick={() => setPaperFor({ carerId: r.carerId, carerName: r.carerName })}>📄 Paper</button>
                          )}
                          {r.lastCheckId && <button className="btn-secondary btn btn-sm" onClick={() => setViewId(r.lastCheckId)}>View</button>}
                          {r.lastCheckId && <button className="btn-secondary btn btn-sm" onClick={() => setEditId(r.lastCheckId)}>Edit</button>}
                          {r.lastCheckId && <button className="text-xs text-red-600 hover:underline" onClick={() => setConfirmDelete(r.lastCheckId)}>Delete</button>}
                        </span>
                      )}
                    </td>
                  </tr>,
                  // Fetched only when opened, so fifty carers' histories are
                  // not pulled on every page load to show none of them.
                  ...(openHistory[r.carerId] && r.lastCheckId
                    ? [
                        <SpotCheckHistoryRows
                          key={`history-${r.carerId}`}
                          carerId={r.carerId}
                          latestId={r.lastCheckId}
                          onView={setViewId}
                          onEdit={setEditId}
                        />,
                      ]
                    : []),
                ];
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {newFor && <SpotCheckModal onClose={() => setNewFor(null)} carerId={newFor === 'any' ? undefined : newFor} />}
      {viewId && <SpotCheckModal onClose={() => setViewId(null)} viewId={viewId} />}
      {editId && <SpotCheckModal onClose={() => setEditId(null)} editId={editId} />}
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
  const [tab, setTab] = useState<Tab>('Worklist');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Supervision</h1>

      <div className="border-b border-gray-200">
        <nav className="flex gap-1 -mb-px overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 sm:px-4 sm:py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'Worklist' && <Worklist />}
      {tab === 'Service Review' && <Reviews embedded />}
      {tab === 'Spot checks' && <SpotChecks />}
      {tab === 'Supervisions' && <StaffSupervisions embedded />}
    </div>
  );
}

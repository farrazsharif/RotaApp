import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { placementsApi } from '../api/placements';
import { serviceUsersApi } from '../api/serviceUsers';
import { usersApi } from '../api/users';
import { Placement, ServiceUser, User } from '../types';
import PlacementModal from '../components/PlacementModal';
import { format, addDays } from 'date-fns';

const RANGES = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 28, label: '4 weeks' },
];

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');
const isoKey = (s: string) => format(new Date(s), 'yyyy-MM-dd');

// Stable pastel per carer so the same carer reads the same colour across the board.
function carerHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

type ModalState =
  | { mode: 'new'; defaults?: { serviceUserId?: string; startDate?: string } }
  | { mode: 'edit'; placement: Placement }
  | null;

export default function LiveIn() {
  const [startDate, setStartDate] = useState<Date>(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  });
  const [rangeLen, setRangeLen] = useState(14);
  const [modal, setModal] = useState<ModalState>(null);

  const days = useMemo(() => Array.from({ length: rangeLen }, (_, i) => addDays(startDate, i)), [startDate, rangeLen]);
  const from = dayKey(days[0]);
  const to = dayKey(days[days.length - 1]);

  const { data: placements = [] } = useQuery({
    queryKey: ['placements', from, to],
    queryFn: () => placementsApi.list({ from, to }),
  });
  const { data: allClients = [] } = useQuery({
    queryKey: ['service-users', 'livein'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const clients = useMemo(() => allClients.filter((c: ServiceUser) => c.careType === 'LIVE_IN'), [allClients]);
  const carerById = useMemo(() => new Map<string, User>(allUsers.map((u: User) => [u.id, u])), [allUsers]);
  const carerName = (id: string) => {
    const u = carerById.get(id);
    return u ? `${u.firstName} ${u.lastName}` : 'Unknown carer';
  };

  // Active (non-cancelled) placements grouped by client.
  const byClient = useMemo(() => {
    const m = new Map<string, Placement[]>();
    for (const p of placements) {
      if (p.status === 'CANCELLED') continue;
      if (!m.has(p.serviceUserId)) m.set(p.serviceUserId, []);
      m.get(p.serviceUserId)!.push(p);
    }
    return m;
  }, [placements]);

  const coverFor = (clientId: string, d: Date): Placement | undefined => {
    const k = dayKey(d);
    return (byClient.get(clientId) || []).find((p) => isoKey(p.startDate) <= k && k <= isoKey(p.endDate));
  };
  const gapCount = (clientId: string) => days.reduce((n, d) => (coverFor(clientId, d) ? n : n + 1), 0);

  const shift = (dir: number) => setStartDate((s) => addDays(s, dir * rangeLen));
  const today = () => { const n = new Date(); setStartDate(new Date(n.getFullYear(), n.getMonth(), n.getDate())); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Live-in</h1>
          <p className="text-sm text-gray-500">Placements for live-in clients. Red = uncovered days.</p>
        </div>
        <button className="btn-primary btn" onClick={() => setModal({ mode: 'new' })}>+ New placement</button>
      </div>

      {/* Range controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-secondary btn btn-sm" onClick={() => shift(-1)}>← Prev</button>
        <button className="btn-secondary btn btn-sm" onClick={today}>Today</button>
        <button className="btn-secondary btn btn-sm" onClick={() => shift(1)}>Next →</button>
        <span className="text-sm text-gray-600 ml-1">{format(days[0], 'dd MMM')} – {format(days[days.length - 1], 'dd MMM yyyy')}</span>
        <span className="flex-1" />
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r.days} onClick={() => setRangeLen(r.days)}
              className={`px-3 py-1 rounded-md text-xs font-medium border ${rangeLen === r.days ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-500">No live-in clients yet.</p>
          <p className="text-sm text-gray-400 mt-1">Set a service user's <span className="font-medium">Care Type</span> to <span className="font-medium">Live-in</span> (on their edit page) and they'll appear here.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="border-collapse text-sm" style={{ minWidth: 220 + rangeLen * 84 }}>
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 border-b border-r p-2 text-left w-56 min-w-[220px]">Client</th>
                {days.map((d) => {
                  const weekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <th key={dayKey(d)} className={`border-b p-1 text-center font-medium ${weekend ? 'bg-gray-100 text-gray-500' : 'bg-gray-50 text-gray-600'}`} style={{ minWidth: 84 }}>
                      <div>{format(d, 'EEE')}</div>
                      <div className="text-xs font-normal">{format(d, 'dd MMM')}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {clients.map((client: ServiceUser) => {
                const gaps = gapCount(client.id);
                return (
                  <tr key={client.id}>
                    <th className="sticky left-0 z-10 bg-white border-b border-r p-2 text-left align-top">
                      <div className="font-medium text-gray-800">{client.firstName} {client.lastName}</div>
                      {gaps > 0
                        ? <div className="text-xs text-red-600 mt-0.5">⚠ {gaps} uncovered day{gaps === 1 ? '' : 's'}</div>
                        : <div className="text-xs text-green-600 mt-0.5">✓ fully covered</div>}
                    </th>
                    {days.map((d, i) => {
                      const p = coverFor(client.id, d);
                      if (!p) {
                        return (
                          <td key={dayKey(d)} className="border-b p-0" style={{ minWidth: 84 }}>
                            <button
                              onClick={() => setModal({ mode: 'new', defaults: { serviceUserId: client.id, startDate: dayKey(d) } })}
                              className="w-full h-12 bg-red-50 hover:bg-red-100 border border-transparent hover:border-red-200 transition-colors"
                              title="Add a placement starting this day"
                            />
                          </td>
                        );
                      }
                      const hue = carerHue(p.carerId);
                      const isStart = i === 0 || isoKey(p.startDate) === dayKey(d) || !coverFor(client.id, days[i - 1]) || coverFor(client.id, days[i - 1])!.id !== p.id;
                      return (
                        <td key={dayKey(d)} className="border-b p-0" style={{ minWidth: 84 }}>
                          <button
                            onClick={() => setModal({ mode: 'edit', placement: p })}
                            className="w-full h-12 flex flex-col items-center justify-center px-1 overflow-hidden"
                            style={{ backgroundColor: `hsl(${hue},70%,90%)`, color: `hsl(${hue},55%,30%)` }}
                            title={`${carerName(p.carerId)} · ${isoKey(p.startDate)} → ${isoKey(p.endDate)} · ${p.nightType === 'WAKING' ? 'Waking night' : 'Sleep-in'}${p.note ? ` · ${p.note}` : ''}`}
                          >
                            {isStart && (
                              <>
                                <span className="text-xs font-semibold truncate max-w-full leading-tight">{carerName(p.carerId)}</span>
                                <span className="text-[10px] leading-tight">{p.nightType === 'WAKING' ? '🌙 waking' : '😴 sleep-in'}</span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">Tap a coloured block to edit a placement, or a red cell to add cover starting that day.</p>

      {modal?.mode === 'new' && (
        <PlacementModal defaults={modal.defaults} clients={clients} carers={allUsers} onClose={() => setModal(null)} />
      )}
      {modal?.mode === 'edit' && (
        <PlacementModal placement={modal.placement} clients={clients} carers={allUsers} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

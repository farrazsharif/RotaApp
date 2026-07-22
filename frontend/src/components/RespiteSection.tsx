import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { respiteApi, RespitePeriod } from '../api/respite';

function fmt(d: string) {
  return format(new Date(d), 'd MMM yyyy, HH:mm');
}

function periodState(p: RespitePeriod): 'active' | 'upcoming' | 'past' {
  const now = Date.now();
  const start = new Date(p.startAt).getTime();
  const end = new Date(p.endAt).getTime();
  if (now < start) return 'upcoming';
  if (now >= end) return 'past';
  return 'active';
}

export default function RespiteSection({ serviceUserId, isManager }: { serviceUserId: string; isManager: boolean }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: periods = [], isLoading } = useQuery({
    queryKey: ['respite', serviceUserId],
    queryFn: () => respiteApi.list(serviceUserId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['respite', serviceUserId] });
    // Cancelled visits drop off the rota — refresh schedules/calendars.
    qc.invalidateQueries({ queryKey: ['shifts'] });
    qc.invalidateQueries({ queryKey: ['service-user', serviceUserId] });
  };

  const createMut = useMutation({
    mutationFn: () => respiteApi.create({
      serviceUserId,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      note: note.trim() || undefined,
    }),
    onSuccess: () => { refresh(); setAdding(false); setStartAt(''); setEndAt(''); setNote(''); setErr(''); },
    onError: (e: unknown) => setErr((e as { response?: { data?: { error?: string } } }).response?.data?.error || 'Could not save the respite period.'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => respiteApi.remove(id),
    onSuccess: () => { refresh(); setConfirmDeleteId(null); },
  });

  const active = periods.find((p) => periodState(p) === 'active');

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">🏖️ Away / Respite</h2>
        {isManager && !adding && (
          <button className="btn-secondary btn btn-sm" onClick={() => { setAdding(true); setErr(''); }}>+ Add respite period</button>
        )}
      </div>

      {active && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Currently on respite until <strong>{fmt(active.endAt)}</strong> — visits in this window are cancelled and non-chargeable.
        </div>
      )}

      {isManager && adding && (
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-xs text-gray-500">
            All scheduled visits between these two times are cancelled and marked <strong>non-chargeable</strong> (the client is away).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Away from (care pauses)</label>
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Care restarts</label>
              <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Reason / note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="e.g. Respite care at Oakwood; family holiday" />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button
              className="btn-primary btn"
              disabled={!startAt || !endAt || createMut.isPending}
              onClick={() => { setErr(''); createMut.mutate(); }}
            >
              {createMut.isPending ? 'Saving…' : 'Start respite & cancel visits'}
            </button>
            <button className="btn-secondary btn" onClick={() => { setAdding(false); setErr(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-gray-400">No respite periods recorded.</p>
      ) : (
        <div className="space-y-2">
          {periods.map((p) => {
            const st = periodState(p);
            const badge = st === 'active'
              ? <span className="badge bg-amber-100 text-amber-700">On respite now</span>
              : st === 'upcoming'
                ? <span className="badge bg-blue-100 text-blue-700">Upcoming</span>
                : <span className="badge-gray badge">Past</span>;
            return (
              <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">{fmt(p.startAt)} → {fmt(p.endAt)}</p>
                    {badge}
                  </div>
                  {p.note && <p className="text-sm text-gray-600 mt-0.5">{p.note}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {p.cancelledCount} visit{p.cancelledCount === 1 ? '' : 's'} cancelled · added by {p.createdByName}
                  </p>
                </div>
                {isManager && (
                  confirmDeleteId === p.id ? (
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-red-700">Remove?</span>
                      <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(p.id)}>Yes</button>
                      <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDeleteId(null)}>No</button>
                    </span>
                  ) : (
                    <button className="text-red-600 text-xs hover:underline flex-shrink-0" onClick={() => setConfirmDeleteId(p.id)}>Remove</button>
                  )
                )}
              </div>
            );
          })}
          {isManager && (
            <p className="text-xs text-gray-400">
              Removing a respite period doesn't automatically restore cancelled visits — re-add them on the schedule if needed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

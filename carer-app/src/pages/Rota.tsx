import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import Layout from '../components/Layout';
import { myShiftsQuery } from '../lib/shiftsQuery';
import { handoversApi } from '../api/handovers';
import { useAuth } from '../contexts/AuthContext';
import { isCallDone } from '../lib/shiftStatus';
import { formatTime12h } from '../lib/time';
import type { Shift } from '../types';

const fmtSpent = (mins: number) => { const h = Math.floor(mins / 60); const m = Math.round(mins % 60); return h ? `${h}h ${m}m` : `${m}m`; };

export default function Rota() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  // Remember the date the carer was viewing so returning from a call lands back
  // on the same day, not today.
  const initialSelected = (() => {
    const s = sessionStorage.getItem('rota_selected');
    if (!s) return new Date();
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date() : d;
  })();
  // The Monday of the week on show, and the day selected within it.
  const [weekStart, setWeekStart] = useState(startOfWeek(initialSelected, { weekStartsOn: 1 }));
  const [selected, setSelected] = useState(initialSelected);
  useEffect(() => { sessionStorage.setItem('rota_selected', selected.toISOString()); }, [selected]);

  async function refresh() {
    setRefreshing(true);
    try { await qc.invalidateQueries(); } finally { setRefreshing(false); }
  }

  const { data: shifts = [], isLoading } = useQuery({
    ...myShiftsQuery(user?.id ?? ''),
    enabled: !!user,
  });

  const { data: handovers } = useQuery({
    queryKey: ['my-handovers'],
    queryFn: handoversApi.mine,
    refetchInterval: 60000,
  });
  const coverRequestedIds = new Set(
    (handovers?.outgoing ?? []).filter((h) => h.status === 'PENDING').map((h) => h.shiftId),
  );

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  function callsForDay(day: Date) {
    return shifts
      .filter((s) => isSameDay(new Date(s.date), day) && s.status !== 'CANCELLED')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  const hasShifts = (day: Date) => callsForDay(day).length > 0;

  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // Overnight visits (e.g. 19:00–07:00) wrap past midnight — add a day.
  const durMin = (s: Shift) => { let d = toMin(s.endTime) - toMin(s.startTime); if (d < 0) d += 24 * 60; return d; };
  const fmtHours = (mins: number) => (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1);
  const minsFor = (list: Shift[]) => list.reduce((sum, s) => sum + durMin(s), 0);

  // Actual time the carer clocked on a visit (sums their completed records).
  const spentMins = (s: Shift): number | null => {
    const recs = (s.clockRecords ?? []).filter((r) => r.userId === userId && r.clockOut);
    if (!recs.length) return null;
    return recs.reduce((sum, r) => sum + (new Date(r.clockOut!).getTime() - new Date(r.clockIn).getTime()) / 60000, 0);
  };

  const selectedShifts = callsForDay(selected);
  const selectedMins = minsFor(selectedShifts);
  const daySpentMins = selectedShifts.reduce((sum, s) => sum + (spentMins(s) ?? 0), 0);
  const weekMins = minsFor(shifts.filter((s) => {
    const d = new Date(s.date);
    return d >= weekStart && d < addDays(weekStart, 7) && s.status !== 'CANCELLED';
  }));

  const shiftWeek = (dir: number) => { setWeekStart((w) => addDays(w, dir * 7)); setSelected((s) => addDays(s, dir * 7)); };
  const goToday = () => { setWeekStart(currentWeekStart); setSelected(new Date()); };
  const isCurrentWeek = isSameDay(weekStart, currentWeekStart);

  return (
    <Layout title="My Rota" onRefresh={refresh} refreshing={refreshing}>
      {/* Hours summary — selected day + the week on show */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3 text-center">
          <p className="text-xs text-gray-500">{isToday(selected) ? 'Today' : format(selected, 'EEE d MMM')}</p>
          <p className="text-xl font-bold text-gray-800">{fmtHours(selectedMins)}h</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3 text-center">
          <p className="text-xs text-gray-500">{isCurrentWeek ? 'This week' : 'Week'}</p>
          <p className="text-xl font-bold text-gray-800">{fmtHours(weekMins)}h</p>
        </div>
      </div>

      {/* Week navigator */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => shiftWeek(-1)} aria-label="Previous week" className="flex items-center justify-center h-11 w-11 -ml-1 text-blue-600 border border-gray-200 active:bg-blue-50 rounded-full">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="text-sm font-semibold text-gray-700">
          {format(weekStart, 'd MMM')} – {format(addDays(weekStart, 6), 'd MMM')}
          {!isCurrentWeek && (
            <button onClick={goToday} className="ml-2 text-xs font-medium text-blue-600">Today</button>
          )}
        </div>
        <button onClick={() => shiftWeek(1)} aria-label="Next week" className="flex items-center justify-center h-11 w-11 -mr-1 text-blue-600 border border-gray-200 active:bg-blue-50 rounded-full">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>

      {/* Day strip */}
      <div className="flex justify-between gap-1 mb-4">
        {weekDays.map((day) => {
          const isSel = isSameDay(day, selected);
          const today = isToday(day);
          const dots = hasShifts(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelected(day)}
              className={`flex-1 flex flex-col items-center py-1.5 rounded-xl border ${
                isSel ? 'bg-blue-600 border-blue-600 text-white' : today ? 'border-blue-200 text-blue-600' : 'border-transparent text-gray-600'
              }`}
            >
              <span className="text-[10px] uppercase">{format(day, 'EEEEE')}</span>
              <span className="text-sm font-bold leading-tight">{format(day, 'd')}</span>
              <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${dots ? (isSel ? 'bg-white' : 'bg-blue-500') : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Loading rota…</p>
      ) : (
        <>
          <p className={`text-sm font-bold mb-2 ${isToday(selected) ? 'text-blue-600' : 'text-gray-500'}`}>
            {isToday(selected) ? 'Today · ' : ''}{format(selected, 'EEEE d MMM')}
            {daySpentMins > 0 && <span className="font-normal text-gray-400"> · {fmtSpent(daySpentMins)} spent</span>}
          </p>
          {selectedShifts.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <p className="text-3xl mb-2">🗓️</p>
              <p className="text-sm">No calls on this day.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedShifts.map((s) => (
                <RotaRow key={s.id} shift={s} done={isCallDone(s, userId)} spent={spentMins(s)} coverRequested={coverRequestedIds.has(s.id)} onClick={() => navigate(`/call/${s.id}`)} />
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}

function RotaRow({ shift, done, spent, coverRequested, onClick }: { shift: Shift; done: boolean; spent: number | null; coverRequested: boolean; onClick: () => void }) {
  const su = shift.serviceUser;
  const name = su ? `${su.firstName} ${su.lastName}` : 'Service user';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl px-3.5 py-3 border flex items-center justify-between ${
        done ? 'bg-green-50 border-green-300' : 'bg-white border-gray-200'
      }`}
    >
      <div>
        <p className="font-semibold text-gray-800 text-sm">{name}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {shift.visitName && <p className="text-xs text-gray-400">{shift.visitName}</p>}
          {shift.run && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${shift.run.color || '#6b7280'}1a`, color: shift.run.color || '#374151' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: shift.run.color || '#6b7280' }} />
              {shift.run.name}
            </span>
          )}
          {coverRequested && !done && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
              🤝 Cover requested
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-gray-700">{formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}</p>
        {done ? (
          <p className="text-xs text-green-600 font-semibold">✓ Done{spent != null ? ` · ${fmtSpent(spent)}` : ''}</p>
        ) : spent != null ? (
          <p className="text-xs text-gray-500">{fmtSpent(spent)} spent</p>
        ) : null}
      </div>
    </button>
  );
}

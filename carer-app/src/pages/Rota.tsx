import { useState } from 'react';
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

export default function Rota() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // Current week + next 2 weeks (21 days) are rendered; the shared query loads a
  // wider window so Today / My Hours share the same cache.
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  async function refresh() {
    setRefreshing(true);
    try { await qc.invalidateQueries(); } finally { setRefreshing(false); }
  }

  const { data: shifts = [], isLoading } = useQuery({
    ...myShiftsQuery(user?.id ?? ''),
    enabled: !!user,
  });

  // Cover requests the carer has sent that are still awaiting a response — used
  // to badge those calls so it's clear cover has been requested for them.
  const { data: handovers } = useQuery({
    queryKey: ['my-handovers'],
    queryFn: handoversApi.mine,
    refetchInterval: 60000,
  });
  const coverRequestedIds = new Set(
    (handovers?.outgoing ?? []).filter((h) => h.status === 'PENDING').map((h) => h.shiftId),
  );

  const days = Array.from({ length: 21 }, (_, i) => addDays(weekStart, i));

  function callsForDay(day: Date) {
    return shifts
      .filter((s) => isSameDay(new Date(s.date), day) && s.status !== 'CANCELLED')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // Today / This-week scheduled hours (current Mon–Sun week).
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  // Overnight visits (e.g. 19:00–07:00) wrap past midnight — add a day when the
  // end reads earlier than the start.
  const durMin = (s: Shift) => { let d = toMin(s.endTime) - toMin(s.startTime); if (d < 0) d += 24 * 60; return d; };
  const fmtHours = (mins: number) => (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1);
  const inWeek = shifts.filter((s) => {
    const d = new Date(s.date);
    return d >= weekStart && d < addDays(weekStart, 7) && s.status !== 'CANCELLED';
  });
  const weekMins = inWeek.reduce((sum, s) => sum + durMin(s), 0);
  const todayMins = inWeek.filter((s) => isSameDay(new Date(s.date), new Date())).reduce((sum, s) => sum + durMin(s), 0);

  return (
    <Layout title="My Rota" onRefresh={refresh} refreshing={refreshing}>
      {/* Hours summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3 text-center">
          <p className="text-xs text-gray-500">Today</p>
          <p className="text-xl font-bold text-gray-800">{fmtHours(todayMins)}h</p>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3 text-center">
          <p className="text-xs text-gray-500">This week</p>
          <p className="text-xl font-bold text-gray-800">{fmtHours(weekMins)}h</p>
        </div>
      </div>

      {isLoading && <p className="text-center text-gray-400 py-8">Loading rota…</p>}
      {!isLoading && (
        <div className="space-y-4">
          {days.map((day) => {
            const dayShifts = callsForDay(day);
            if (dayShifts.length === 0) return null;
            return (
              <div key={day.toISOString()}>
                <p className={`text-sm font-bold mb-1.5 ${isToday(day) ? 'text-blue-600' : 'text-gray-500'}`}>
                  {isToday(day) ? 'Today · ' : ''}{format(day, 'EEEE d MMM')}
                </p>
                <div className="space-y-2">
                  {dayShifts.map((s) => <RotaRow key={s.id} shift={s} done={isCallDone(s, userId)} coverRequested={coverRequestedIds.has(s.id)} onClick={() => navigate(`/call/${s.id}`)} />)}
                </div>
              </div>
            );
          })}
          {shifts.length === 0 && (
            <div className="text-center text-gray-400 py-16">
              <p className="text-4xl mb-2">🗒️</p>
              <p>No upcoming calls in your rota.</p>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

function RotaRow({ shift, done, coverRequested, onClick }: { shift: Shift; done: boolean; coverRequested: boolean; onClick: () => void }) {
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
        {done && <p className="text-xs text-green-600 font-semibold">✓ Done</p>}
      </div>
    </button>
  );
}

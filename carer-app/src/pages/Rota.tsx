import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import Layout from '../components/Layout';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import { isCallDone } from '../lib/shiftStatus';
import { formatTime12h } from '../lib/time';
import type { Shift } from '../types';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

export default function Rota() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['rota', userId, format(weekStart, 'yyyy-MM-dd')],
    queryFn: () =>
      // Widen by a day each side to absorb local-vs-UTC boundary drift; the
      // per-day filtering below re-checks precisely with isSameDay.
      shiftsApi.list({
        userId: user!.id,
        startDate: format(addDays(weekStart, -1), 'yyyy-MM-dd'),
        endDate: format(addDays(weekStart, 7), 'yyyy-MM-dd'),
      }),
    enabled: !!user,
  });

  function callsForDay(day: Date) {
    return shifts
      .filter((s) => isSameDay(new Date(s.date), day) && s.status !== 'CANCELLED')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  const selectedCalls = callsForDay(selectedDate);

  // Total scheduled hours for the selected day and the whole visible week.
  const fmtHours = (mins: number) => (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1);
  const dayMinutes = selectedCalls.reduce((sum, s) => sum + minutesBetween(s.startTime, s.endTime), 0);
  const dayHours = fmtHours(dayMinutes);
  const weekMinutes = days.reduce((sum, day) => sum + callsForDay(day).reduce((s, sh) => s + minutesBetween(sh.startTime, sh.endTime), 0), 0);
  const weekHours = fmtHours(weekMinutes);

  // The next upcoming call, to badge with "Next".
  const nowMs = Date.now();
  const startMs = (s: Shift) => {
    const [h, m] = s.startTime.split(':').map(Number);
    const d = new Date(s.date);
    d.setHours(h, m, 0, 0);
    return d.getTime();
  };
  const nextCallId = shifts
    .filter((s) => s.status !== 'CANCELLED' && !isCallDone(s, userId) && startMs(s) >= nowMs)
    .sort((a, b) => startMs(a) - startMs(b))[0]?.id;

  function shiftWeek(delta: number) {
    const next = addDays(weekStart, delta * 7);
    setWeekStart(next);
    setSelectedDate(next); // land on Monday of the viewed week
  }

  function goToday() {
    const ws = startOfWeek(new Date(), { weekStartsOn: 1 });
    setWeekStart(ws);
    setSelectedDate(new Date());
  }

  return (
    <Layout title="My Rota">
      {/* Calendar strip */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => shiftWeek(-1)} className="text-blue-600 text-xl px-2 leading-none">‹</button>
          <button onClick={goToday} className="font-semibold text-blue-600">
            {format(weekStart, 'MMMM yyyy')}
          </button>
          <button onClick={() => shiftWeek(1)} className="text-blue-600 text-xl px-2 leading-none">›</button>
        </div>
        <div className="flex">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="flex-1 text-center text-xs font-medium text-gray-400">{d}</div>
          ))}
        </div>
        <div className="flex mt-1">
          {days.map((day) => {
            const selected = isSameDay(day, selectedDate);
            const todayCell = isToday(day);
            const hasCalls = callsForDay(day).length > 0;
            return (
              <button key={day.toISOString()} onClick={() => setSelectedDate(day)} className="flex-1 flex flex-col items-center gap-1 py-1">
                <span className={`h-8 w-8 flex items-center justify-center rounded-full text-sm ${
                  selected ? 'bg-blue-600 text-white font-bold'
                  : todayCell ? 'text-blue-600 font-bold ring-1 ring-blue-300'
                  : 'text-gray-700'
                }`}>
                  {format(day, 'd')}
                </span>
                <span className={`h-1.5 w-1.5 rounded-full ${hasCalls && !selected ? 'bg-blue-500' : 'bg-transparent'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* My Hours */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 mb-4">
        <div className="flex items-center gap-2 font-semibold text-gray-800 mb-2">📊 My Hours</div>
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2 text-center">
            <p className="text-xs text-gray-500">This day</p>
            <p className="font-bold text-gray-800">{dayHours}h</p>
          </div>
          <div className="flex-1 rounded-xl bg-gray-50 px-3 py-2 text-center">
            <p className="text-xs text-gray-500">This week</p>
            <p className="font-bold text-gray-800">{weekHours}h</p>
          </div>
        </div>
      </div>

      {/* Selected day's calls */}
      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Loading rota…</p>
      ) : selectedCalls.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <p className="text-4xl mb-2">🗒️</p>
          <p>No calls on {format(selectedDate, 'EEE d MMM')}.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {selectedCalls.map((s) => (
            <RotaCard
              key={s.id}
              shift={s}
              done={isCallDone(s, userId)}
              isNext={s.id === nextCallId}
              onClick={() => navigate(`/call/${s.id}`)}
            />
          ))}
        </div>
      )}
    </Layout>
  );
}

function RotaCard({ shift, done, isNext, onClick }: { shift: Shift; done: boolean; isNext: boolean; onClick: () => void }) {
  const su = shift.serviceUser;
  const name = su ? `${su.firstName} ${su.lastName}` : 'Service user';
  const site = su?.site;
  const barColor = done ? '#16a34a' : site?.color || '#3b82f6';
  const title = `${name}${shift.visitName ? ` ${shift.visitName}` : ''}${shift.cover > 1 ? ` ×${shift.cover}` : ''}`;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border shadow-sm flex overflow-hidden ${
        done ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
      }`}
    >
      {/* Date block */}
      <div className="flex flex-col items-center justify-center px-3 py-3 w-16 shrink-0">
        <span className="text-[11px] font-semibold text-gray-400 uppercase">{format(new Date(shift.date), 'EEE')}</span>
        <span className="text-xl font-bold text-gray-700 leading-tight">{format(new Date(shift.date), 'd')}</span>
      </div>
      {/* Colour bar */}
      <span className="w-1.5 my-2 rounded-full shrink-0" style={{ backgroundColor: barColor }} />
      {/* Body */}
      <div className="flex-1 min-w-0 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-gray-800 leading-snug">{title}</p>
          {isNext && <span className="shrink-0 text-xs font-bold text-white bg-blue-500 px-2 py-0.5 rounded-md">Next</span>}
          {done && !isNext && <span className="shrink-0 text-xs font-bold text-green-700">✓ Done</span>}
        </div>
        <p className="text-sm font-semibold text-gray-600 mt-1">
          {formatTime12h(shift.startTime)} – {formatTime12h(shift.endTime)}
        </p>
        {(site?.name || shift.role) && (
          <p className="text-sm text-gray-400 mt-0.5 flex items-center gap-1">
            💼 {[site?.name, shift.role].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    </button>
  );
}

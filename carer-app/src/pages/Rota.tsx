import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import Layout from '../components/Layout';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import { isCallDone } from '../lib/shiftStatus';
import { formatTime12h } from '../lib/time';
import type { Shift } from '../types';

export default function Rota() {
  const { user } = useAuth();
  const userId = user?.id;
  const navigate = useNavigate();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 13); // current + next week

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['rota', user?.id],
    queryFn: () =>
      // Widen by a day on each side to absorb local-vs-UTC date boundary drift;
      // the per-day grouping below re-filters precisely with isSameDay.
      shiftsApi.list({
        userId: user!.id,
        startDate: format(addDays(weekStart, -1), 'yyyy-MM-dd'),
        endDate: format(addDays(weekEnd, 1), 'yyyy-MM-dd'),
      }),
    enabled: !!user,
  });

  const days = Array.from({ length: 14 }, (_, i) => addDays(weekStart, i));

  function callsForDay(day: Date) {
    return shifts
      .filter((s) => isSameDay(new Date(s.date), day) && s.status !== 'CANCELLED')
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <Layout title="My Rota">
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
                  {dayShifts.map((s) => <RotaRow key={s.id} shift={s} done={isCallDone(s, userId)} onClick={() => navigate(`/call/${s.id}`)} />)}
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

function RotaRow({ shift, done, onClick }: { shift: Shift; done: boolean; onClick: () => void }) {
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
        {shift.visitName && <p className="text-xs text-gray-400">{shift.visitName}</p>}
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-gray-700">{formatTime12h(shift.startTime)}–{formatTime12h(shift.endTime)}</p>
        {done && <p className="text-xs text-green-600 font-semibold">✓ Done</p>}
      </div>
    </button>
  );
}

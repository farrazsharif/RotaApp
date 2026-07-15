import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, addWeeks, isSameDay } from 'date-fns';
import Layout from '../components/Layout';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import type { Shift } from '../types';

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const durMin = (s: Shift) => Math.max(0, toMin(s.endTime) - toMin(s.startTime));
const fmtHours = (mins: number) => (mins / 60).toFixed(mins % 60 === 0 ? 0 : 1);

// Last 4 weeks of the carer's scheduled hours (this week + the previous 3),
// with a weekly total per row and a 4-week grand total.
export default function History() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const firstWeekStart = addWeeks(thisWeekStart, -3);

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['history-shifts', user?.id],
    queryFn: () => shiftsApi.list({
      userId: user!.id,
      startDate: format(addDays(firstWeekStart, -1), 'yyyy-MM-dd'),
      endDate: format(addDays(thisWeekStart, 7), 'yyyy-MM-dd'),
    }),
    enabled: !!user,
  });

  const weeks = Array.from({ length: 4 }, (_, i) => {
    const ws = addWeeks(firstWeekStart, i);
    const we = addDays(ws, 6);
    const mins = shifts
      .filter((s) => { const d = new Date(s.date); return d >= ws && d < addDays(ws, 7) && s.status !== 'CANCELLED'; })
      .reduce((sum, s) => sum + durMin(s), 0);
    return { ws, we, mins, isCurrent: isSameDay(ws, thisWeekStart) };
  }).reverse(); // most recent week first

  const totalMins = weeks.reduce((sum, w) => sum + w.mins, 0);

  async function refresh() {
    setRefreshing(true);
    try { await qc.invalidateQueries(); } finally { setRefreshing(false); }
  }

  return (
    <Layout title="History" onRefresh={refresh} refreshing={refreshing}>
      {/* 4-week grand total */}
      <div className="rounded-2xl bg-blue-600 text-white shadow-sm px-4 py-4 mb-4 text-center">
        <p className="text-xs uppercase tracking-wide text-blue-100">Last 4 weeks · scheduled</p>
        <p className="text-3xl font-bold">{fmtHours(totalMins)}h</p>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Loading…</p>
      ) : (
        <div className="space-y-2">
          {weeks.map((w) => (
            <div key={w.ws.toISOString()} className="flex items-center justify-between rounded-2xl bg-white border border-gray-200 shadow-sm px-4 py-3">
              <div>
                <p className="font-semibold text-gray-800">
                  {format(w.ws, 'd MMM')} – {format(w.we, 'd MMM')}
                </p>
                {w.isCurrent && <p className="text-xs text-blue-600 font-medium">This week</p>}
              </div>
              <p className="text-lg font-bold text-gray-700">{fmtHours(w.mins)}h</p>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

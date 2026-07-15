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
const weekKey = (d: Date) => format(d, 'yyyy-MM-dd');

// "My Hours": the carer's scheduled hours across a 6-week window (previous 3
// weeks, this week, and the next 2). Each week has a checkbox; the top bar
// totals the selected weeks. Default selection is the current week.
export default function History() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const firstWeekStart = addWeeks(thisWeekStart, -3); // 3 weeks back
  const lastWeekStart = addWeeks(thisWeekStart, 2);   // 2 weeks ahead

  const [selected, setSelected] = useState<Set<string>>(() => new Set([weekKey(thisWeekStart)]));
  const toggle = (key: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['my-hours-shifts', user?.id],
    queryFn: () => shiftsApi.list({
      userId: user!.id,
      startDate: format(addDays(firstWeekStart, -1), 'yyyy-MM-dd'),
      endDate: format(addDays(lastWeekStart, 8), 'yyyy-MM-dd'),
    }),
    enabled: !!user,
  });

  const weeks = Array.from({ length: 6 }, (_, i) => {
    const ws = addWeeks(firstWeekStart, i);
    const we = addDays(ws, 6);
    const mins = shifts
      .filter((s) => { const d = new Date(s.date); return d >= ws && d < addDays(ws, 7) && s.status !== 'CANCELLED'; })
      .reduce((sum, s) => sum + durMin(s), 0);
    return { key: weekKey(ws), ws, we, mins, isCurrent: isSameDay(ws, thisWeekStart), isFuture: ws > thisWeekStart };
  }).reverse(); // newest (upcoming) first, oldest last

  const selectedMins = weeks.filter((w) => selected.has(w.key)).reduce((sum, w) => sum + w.mins, 0);
  const selectedCount = selected.size;

  async function refresh() {
    setRefreshing(true);
    try { await qc.invalidateQueries(); } finally { setRefreshing(false); }
  }

  return (
    <Layout title="My Hours" onRefresh={refresh} refreshing={refreshing}>
      {/* Selected total */}
      <div className="rounded-2xl bg-blue-600 text-white shadow-sm px-4 py-4 mb-4 text-center">
        <p className="text-xs uppercase tracking-wide text-blue-100">
          {selectedCount === 0 ? 'Select weeks below' : `${selectedCount} week${selectedCount > 1 ? 's' : ''} selected · scheduled`}
        </p>
        <p className="text-3xl font-bold">{fmtHours(selectedMins)}h</p>
      </div>

      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Loading…</p>
      ) : (
        <div className="space-y-2">
          {weeks.map((w) => {
            const isSel = selected.has(w.key);
            return (
              <button
                key={w.key}
                onClick={() => toggle(w.key)}
                className={`w-full flex items-center gap-3 rounded-2xl border shadow-sm px-4 py-3 text-left ${isSel ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}
              >
                <span className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center text-xs font-bold ${isSel ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800">{format(w.ws, 'd MMM')} – {format(w.we, 'd MMM')}</p>
                  <p className="text-xs">
                    {w.isCurrent
                      ? <span className="text-blue-600 font-medium">This week</span>
                      : w.isFuture
                        ? <span className="text-gray-400">Upcoming</span>
                        : <span className="text-gray-400">Past</span>}
                  </p>
                </div>
                <p className="text-lg font-bold text-gray-700">{fmtHours(w.mins)}h</p>
              </button>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

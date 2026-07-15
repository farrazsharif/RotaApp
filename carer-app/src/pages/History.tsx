import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, addWeeks, isSameDay } from 'date-fns';
import Layout from '../components/Layout';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import { formatTime12h } from '../lib/time';
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
  const lastWeekStart = addWeeks(thisWeekStart, 4);   // 4 weeks ahead
  const WEEK_COUNT = 8;                               // 3 past + current + 4 ahead

  const [selected, setSelected] = useState<Set<string>>(() => new Set([weekKey(thisWeekStart)]));
  const toggle = (key: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggleExpand = (key: string) => setExpanded((prev) => {
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

  const weeks = Array.from({ length: WEEK_COUNT }, (_, i) => {
    const ws = addWeeks(firstWeekStart, i);
    const we = addDays(ws, 6);
    const list = shifts
      .filter((s) => { const d = new Date(s.date); return d >= ws && d < addDays(ws, 7) && s.status !== 'CANCELLED'; })
      .sort((a, b) => {
        const da = new Date(a.date).getTime(); const db = new Date(b.date).getTime();
        return da !== db ? da - db : a.startTime.localeCompare(b.startTime);
      });
    const mins = list.reduce((sum, s) => sum + durMin(s), 0);
    return { key: weekKey(ws), ws, we, mins, list, isCurrent: isSameDay(ws, thisWeekStart), isFuture: ws > thisWeekStart };
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
            const isExp = expanded.has(w.key);
            return (
              <div key={w.key} className={`rounded-2xl border shadow-sm overflow-hidden ${isSel ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Checkbox — selects the week for the total */}
                  <button
                    onClick={() => toggle(w.key)}
                    aria-label="Select week"
                    className={`h-5 w-5 shrink-0 rounded border flex items-center justify-center text-xs font-bold ${isSel ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 text-transparent'}`}
                  >
                    ✓
                  </button>
                  {/* Rest of the row — taps to expand the week's shifts */}
                  <button onClick={() => toggleExpand(w.key)} className="flex-1 flex items-center gap-2 min-w-0 text-left">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-800">{format(w.ws, 'd MMM')} – {format(w.we, 'd MMM')}</p>
                      <p className="text-xs">
                        {w.isCurrent
                          ? <span className="text-blue-600 font-medium">This week</span>
                          : w.isFuture
                            ? <span className="text-gray-400">Upcoming</span>
                            : <span className="text-gray-400">Past</span>}
                        <span className="text-gray-400"> · {w.list.length} shift{w.list.length === 1 ? '' : 's'}</span>
                      </p>
                    </div>
                    <p className="text-lg font-bold text-gray-700">{fmtHours(w.mins)}h</p>
                    <span className={`text-gray-400 transition-transform ${isExp ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                </div>

                {isExp && (
                  <div className="border-t border-gray-100 px-4 py-2 space-y-2">
                    {w.list.length === 0 ? (
                      <p className="text-sm text-gray-400 py-1">No scheduled shifts this week.</p>
                    ) : (
                      w.list.map((s) => (
                        <div key={s.id} className="flex items-start justify-between gap-2 text-sm">
                          <div className="min-w-0">
                            <p className="text-gray-800 truncate">
                              {s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'Visit'}
                              {s.visitName ? ` · ${s.visitName}` : ''}
                            </p>
                            <p className="text-xs text-gray-400">{format(new Date(s.date), 'EEE d MMM')}</p>
                          </div>
                          <p className="text-gray-600 shrink-0">{formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

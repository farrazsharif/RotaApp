import { useMemo, useState, useRef, useEffect } from 'react';
import type { DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi } from '../api/shifts';
import { usersApi } from '../api/users';
import { Shift, User } from '../types';
import { format, startOfWeek, addDays, addWeeks } from 'date-fns';
import { formatTime12h } from '../lib/time';

// Minutes a shift covers (handles overnight shifts that wrap past midnight).
function shiftMins(s: Shift): number {
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins;
}

function hhmmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minToHHMM(min: number): string {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hoursLabel(mins: number): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// A staff member carries a shift if they're the primary carer or a cover carer.
function carries(s: Shift, uid: string): boolean {
  return s.userId === uid || (s.coverCarers?.some((c) => c.id === uid) ?? false);
}

export default function Roster() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(new Date());
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'week' | 'hours'>('week');
  // Drag-and-drop: the shift being dragged and the cell currently hovered.
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null); // `${userId}|${dayKey}`

  // Reassign a shift to a carer and/or move it to another day. Cover-carer-only
  // shifts get a new primary carer; the date is set from the target column.
  const moveMut = useMutation({
    mutationFn: ({ id, userId, date }: { id: string; userId: string; date: string }) =>
      shiftsApi.update(id, { userId, date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  // Hours view: re-time a call (and optionally move it to another carer's lane).
  const timeMut = useMutation({
    mutationFn: ({ id, startTime, endTime, userId }: { id: string; startTime: string; endTime: string; userId: string }) =>
      shiftsApi.update(id, { startTime, endTime, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  // One-click "fix clashes": re-time every changed call in one batch. Applied
  // to the scheduled times only — clock-in records are left as-is.
  const spaceMut = useMutation({
    mutationFn: async (updates: { id: string; startTime: string; endTime: string }[]) => {
      for (const u of updates) await shiftsApi.update(u.id, { startTime: u.startTime, endTime: u.endTime });
      return updates.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  const weekStart = useMemo(() => startOfWeek(anchor, { weekStartsOn: 1 }), [anchor]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const fromStr = format(weekStart, 'yyyy-MM-dd');
  const toStr = format(addDays(weekStart, 6), 'yyyy-MM-dd');
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const dayKey = (d: Date | string) => format(new Date(d), 'yyyy-MM-dd');

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list({ active: true }),
  });
  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts', fromStr, toStr, 'all'],
    queryFn: () => shiftsApi.list({ startDate: fromStr, endDate: toStr }),
    placeholderData: (prev) => prev,
  });

  const liveShifts = useMemo(
    () => shifts.filter((s) => s.status !== 'CANCELLED'),
    [shifts],
  );

  const term = search.trim().toLowerCase();
  const staff = useMemo(() => {
    const list = users
      .filter((u) => !term || `${u.firstName} ${u.lastName}`.toLowerCase().includes(term))
      .slice()
      .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
    return list;
  }, [users, term]);

  // shifts each staff member works, keyed by day, plus weekly total minutes.
  const rows = useMemo(() => {
    return staff.map((u) => {
      const byDay = new Map<string, Shift[]>();
      let weekMins = 0;
      for (const s of liveShifts) {
        if (!carries(s, u.id)) continue;
        const k = dayKey(s.date);
        const arr = byDay.get(k);
        if (arr) arr.push(s); else byDay.set(k, [s]);
        weekMins += shiftMins(s);
      }
      for (const arr of byDay.values()) arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
      return { user: u, byDay, weekMins };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, liveShifts]);

  const totalWeekMins = rows.reduce((a, r) => a + r.weekMins, 0);
  const staffWorking = rows.filter((r) => r.weekMins > 0).length;

  // Hours view works one day at a time (the anchor day, always inside the
  // loaded week). dayShifts = that day's calls; clashIds = calls that overlap
  // another call on the same carer.
  const anchorKey = dayKey(anchor);
  const dayShifts = useMemo(
    () => liveShifts.filter((s) => dayKey(s.date) === anchorKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveShifts, anchorKey],
  );
  const clashIds = useMemo(() => detectClashes(dayShifts), [dayShifts]);

  // Sequence a carer's calls with 5 minutes of travel time and save the batch.
  const fixCarerClashes = (userId: string) => {
    const list = dayShifts.filter((s) => carries(s, userId));
    const updates = spaceCalls(list, 5);
    if (updates.length) spaceMut.mutate(updates);
  };

  const weekTitle = `${format(weekStart, 'dd MMM')} – ${format(addDays(weekStart, 6), 'dd MMM yyyy')}`;
  const title = view === 'hours' ? format(anchor, 'EEEE, dd MMM yyyy') : weekTitle;
  const step = (dir: number) => setAnchor((a) => (view === 'hours' ? addDays(a, dir) : addWeeks(a, dir)));

  if (usersLoading || shiftsLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-40 text-center">
        <div className="animate-spin h-12 w-12 border-4 border-gray-200 border-t-blue-600 rounded-full" />
        <p className="text-lg font-semibold text-gray-800">Loading roster…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-900">Roster</h1>
          {(moveMut.isPending || timeMut.isPending || spaceMut.isPending) && <span className="text-xs text-blue-600">Saving…</span>}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>🖨 Print</button>
      </div>
      <p className="text-xs text-gray-400 print:hidden">
        {view === 'hours'
          ? 'Tip: drag a call left/right to change its time, or up/down onto another carer. Overlapping calls are stacked and outlined red.'
          : 'Tip: drag a shift onto another carer or day to reassign it.'}
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <div className="flex">
            <button className="btn-secondary btn btn-sm rounded-r-none" onClick={() => step(-1)} aria-label="Previous">‹</button>
            <button className="btn-secondary btn btn-sm rounded-l-none border-l-0" onClick={() => step(1)} aria-label="Next">›</button>
          </div>
          <button className="btn-secondary btn btn-sm" onClick={() => setAnchor(new Date())}>{view === 'hours' ? 'Today' : 'This week'}</button>
          <span className="font-semibold text-gray-800 ml-1">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {(['week', 'hours'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 border-l first:border-l-0 border-gray-200 capitalize ${view === v ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff…"
            className="input w-48 text-sm"
          />
        </div>
      </div>

      {/* Print-only heading */}
      <div className="hidden print:block">
        <h1 className="text-lg font-bold">Weekly Roster — {title}</h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 print:hidden">
        {view === 'hours' ? (
          <>
            <SummaryTile value={dayShifts.length} label="Calls today" />
            <SummaryTile value={staff.filter((u) => dayShifts.some((s) => carries(s, u.id))).length} label="Carers on shift" />
            <SummaryTile value={clashIds.size} label="Clashing calls" />
          </>
        ) : (
          <>
            <SummaryTile value={staffWorking} label="Staff working" />
            <SummaryTile value={staff.length} label="Active staff" />
            <SummaryTile value={hoursLabel(totalWeekMins)} label="Total hours" />
          </>
        )}
      </div>

      {/* Hours (day timeline) view */}
      {view === 'hours' && (
        <HoursTimeline
          staff={staff}
          dayShifts={dayShifts}
          clashIds={clashIds}
          fixing={spaceMut.isPending}
          onFixClashes={fixCarerClashes}
          onCommit={(id, startTime, endTime, userId) => timeMut.mutate({ id, startTime, endTime, userId })}
        />
      )}

      {/* Week grid */}
      {view === 'week' && (
      <div className="card p-0 overflow-x-auto">
        <div className="min-w-max">
          {/* Header */}
          <div
            className="grid border-b border-gray-200 bg-gray-50"
            style={{ gridTemplateColumns: `180px repeat(7, minmax(130px, 1fr)) 90px` }}
          >
            <div className="px-3 py-2 text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 z-10">Staff</div>
            {days.map((d) => (
              <div
                key={dayKey(d)}
                className={`px-2 py-2 text-xs font-medium text-center border-l border-gray-100 ${dayKey(d) === todayKey ? 'bg-blue-50 text-blue-700' : 'text-gray-600'}`}
              >
                {format(d, 'EEE')}<br /><span className="text-gray-400">{format(d, 'dd/MM')}</span>
              </div>
            ))}
            <div className="px-2 py-2 text-xs font-medium text-gray-500 text-center border-l border-gray-200">Total</div>
          </div>

          {/* Rows */}
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-gray-400 text-center">No staff to show.</div>
          ) : (
            rows.map((r) => (
              <div
                key={r.user.id}
                className="grid border-b border-gray-50 last:border-b-0"
                style={{ gridTemplateColumns: `180px repeat(7, minmax(130px, 1fr)) 90px` }}
              >
                <div className="px-3 py-2 text-sm font-medium text-gray-800 sticky left-0 bg-white z-10 flex items-center">
                  {r.user.firstName} {r.user.lastName}
                </div>
                {days.map((d) => {
                  const dk = dayKey(d);
                  const list = r.byDay.get(dk) ?? [];
                  const cellKey = `${r.user.id}|${dk}`;
                  const isTarget = dropTarget === cellKey;
                  const onDrop = (e: ReactDragEvent) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const id = e.dataTransfer.getData('text/plain') || dragId;
                    setDragId(null);
                    if (!id) return;
                    const s = liveShifts.find((x) => x.id === id);
                    // No-op if dropped where it already is (same carer + same day).
                    if (s && s.userId === r.user.id && dayKey(s.date) === dk) return;
                    moveMut.mutate({ id, userId: r.user.id, date: dk });
                  };
                  return (
                    <div
                      key={dk}
                      onDragOver={(e) => { e.preventDefault(); setDropTarget(cellKey); }}
                      onDragLeave={() => setDropTarget((t) => (t === cellKey ? null : t))}
                      onDrop={onDrop}
                      className={`border-l border-gray-100 p-1 space-y-1 min-h-[52px] transition-colors ${isTarget ? 'bg-blue-100 ring-2 ring-inset ring-blue-400' : ''}`}
                    >
                      {list.map((s) => {
                        const color = s.serviceUser?.site?.color || '#3b82f6';
                        const client = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : (s.visitName || 'Shift');
                        return (
                          <div
                            key={s.id}
                            draggable
                            onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); }}
                            onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                            title="Drag to another carer or day to reassign"
                            className={`rounded px-1.5 py-1 text-[11px] leading-tight cursor-move select-none ${!s.published ? 'opacity-90' : ''} ${dragId === s.id ? 'opacity-40' : ''}`}
                            style={{ backgroundColor: `${color}22` }}
                          >
                            <div className="font-semibold text-gray-800">{formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}</div>
                            <div className="truncate text-gray-600">
                              {client}{!s.published ? ' · draft' : ''}
                            </div>
                          </div>
                        );
                      })}
                      {list.length === 0 && <div className="text-[11px] text-gray-300 text-center pt-1">—</div>}
                    </div>
                  );
                })}
                <div className="border-l border-gray-200 px-2 py-2 text-sm font-semibold text-gray-700 text-center flex items-center justify-center tabular-nums">
                  {hoursLabel(r.weekMins)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      )}
    </div>
  );
}

function SummaryTile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-3 py-1.5 flex items-baseline gap-2">
      <div className="text-lg font-bold leading-none text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 leading-tight">{label}</div>
    </div>
  );
}

// Ids of calls that overlap another call assigned to the same carer.
function detectClashes(list: Shift[]): Set<string> {
  const set = new Set<string>();
  const byUser = new Map<string, Shift[]>();
  for (const s of list) {
    if (!s.userId) continue;
    const a = byUser.get(s.userId);
    if (a) a.push(s); else byUser.set(s.userId, [s]);
  }
  for (const arr of byUser.values()) {
    const sorted = arr.slice().sort((a, b) => hhmmToMin(a.startTime) - hhmmToMin(b.startTime));
    for (let i = 0; i < sorted.length; i++) {
      const aEnd = hhmmToMin(sorted[i].startTime) + shiftMins(sorted[i]);
      for (let j = i + 1; j < sorted.length; j++) {
        if (hhmmToMin(sorted[j].startTime) < aEnd) { set.add(sorted[i].id); set.add(sorted[j].id); }
        else break; // sorted ascending: no later call can overlap either
      }
    }
  }
  return set;
}

// Re-time a carer's calls so consecutive calls never overlap and always leave
// `gapMin` minutes of travel time. The earliest call keeps its start; each later
// call is pushed just enough to sit `gapMin` after the previous one ends. Calls
// that already have enough space are left untouched. Durations are preserved.
// Returns only the calls whose time actually changed.
function spaceCalls(list: Shift[], gapMin: number): { id: string; startTime: string; endTime: string }[] {
  const sorted = list.slice().sort((a, b) => hhmmToMin(a.startTime) - hhmmToMin(b.startTime));
  const updates: { id: string; startTime: string; endTime: string }[] = [];
  let prevEnd = -Infinity;
  for (const s of sorted) {
    const dur = shiftMins(s);
    const origStart = hhmmToMin(s.startTime);
    const start = prevEnd !== -Infinity && origStart < prevEnd + gapMin ? prevEnd + gapMin : origStart;
    const end = start + dur;
    if (start !== origStart) updates.push({ id: s.id, startTime: minToHHMM(start), endTime: minToHHMM(end) });
    prevEnd = end;
  }
  return updates;
}

// Greedy row packing so overlapping calls stack vertically instead of hiding
// behind each other. Returns each call's sub-row index and the row count.
function packLane(list: Shift[]): { rowOf: Map<string, number>; rowCount: number } {
  const ends: number[] = [];
  const rowOf = new Map<string, number>();
  const sorted = list.slice().sort((a, b) => hhmmToMin(a.startTime) - hhmmToMin(b.startTime));
  for (const s of sorted) {
    const st = hhmmToMin(s.startTime);
    const en = st + shiftMins(s);
    let placed = -1;
    for (let i = 0; i < ends.length; i++) {
      if (ends[i] <= st) { ends[i] = en; placed = i; break; }
    }
    if (placed < 0) { ends.push(en); placed = ends.length - 1; }
    rowOf.set(s.id, placed);
  }
  return { rowOf, rowCount: Math.max(1, ends.length) };
}

// --- Hours (day timeline) view ---------------------------------------------
const DAY_START = 6 * 60;   // 06:00
const DAY_END = 23 * 60;    // 23:00
const PX_PER_MIN = 2;       // 2px per minute → 17h ≈ 2040px wide
const LANE_W = (DAY_END - DAY_START) * PX_PER_MIN;
const NAME_W = 150;
const ROW_H = 34;
const ROW_GAP = 4;
const SNAP = 5;             // snap times to 5-minute steps

type DragSession = {
  id: string; origStartMin: number; duration: number; origUserId: string;
  startX: number; lastDelta: number; lastTarget: string;
};
type Preview = { id: string; deltaMin: number; targetUserId: string };

function HoursTimeline({ staff, dayShifts, clashIds, fixing, onFixClashes, onCommit }: {
  staff: User[];
  dayShifts: Shift[];
  clashIds: Set<string>;
  fixing: boolean;
  onFixClashes: (userId: string) => void;
  onCommit: (id: string, startTime: string, endTime: string, userId: string) => void;
}) {
  const sessionRef = useRef<DragSession | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const sess = sessionRef.current;
      if (!sess) return;
      const rawDelta = (e.clientX - sess.startX) / PX_PER_MIN;
      let deltaMin = Math.round(rawDelta / SNAP) * SNAP;
      // Keep the block inside the visible day.
      const clampedStart = Math.min(DAY_END - sess.duration, Math.max(DAY_START, sess.origStartMin + deltaMin));
      deltaMin = clampedStart - sess.origStartMin;
      // Which carer lane is under the cursor (block has pointer-events off while dragging).
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const lane = el && (el as HTMLElement).closest('[data-lane-user]');
      const targetUserId = (lane as HTMLElement | null)?.dataset.laneUser || sess.origUserId;
      sess.lastDelta = deltaMin;
      sess.lastTarget = targetUserId;
      setPreview({ id: sess.id, deltaMin, targetUserId });
    };
    const onUp = () => {
      const sess = sessionRef.current;
      sessionRef.current = null;
      setPreview(null);
      if (!sess) return;
      if (sess.lastDelta === 0 && sess.lastTarget === sess.origUserId) return;
      const newStart = sess.origStartMin + sess.lastDelta;
      onCommit(sess.id, minToHHMM(newStart), minToHHMM(newStart + sess.duration), sess.lastTarget);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onCommit]);

  const startDrag = (e: ReactMouseEvent, s: Shift) => {
    e.preventDefault();
    sessionRef.current = {
      id: s.id,
      origStartMin: hhmmToMin(s.startTime),
      duration: shiftMins(s),
      origUserId: s.userId || '',
      startX: e.clientX,
      lastDelta: 0,
      lastTarget: s.userId || '',
    };
    setPreview({ id: s.id, deltaMin: 0, targetUserId: s.userId || '' });
  };

  const hours: number[] = [];
  for (let h = DAY_START / 60; h <= DAY_END / 60; h++) hours.push(h);
  const fmtHour = (h: number) => {
    const ap = h < 12 || h === 24 ? 'am' : 'pm';
    const hr = ((h + 11) % 12) + 1;
    return `${hr}${ap}`;
  };

  return (
    <div className="card p-0 overflow-x-auto select-none">
      <div style={{ width: NAME_W + LANE_W }}>
        {/* Time axis */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <div className="shrink-0 sticky left-0 z-20 bg-gray-50 border-r border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500" style={{ width: NAME_W }}>
            Carer
          </div>
          <div className="relative" style={{ width: LANE_W, height: 28 }}>
            {hours.map((h) => (
              <div key={h} className="absolute top-0 h-full border-l border-gray-200 pl-1 text-[10px] text-gray-400"
                style={{ left: (h * 60 - DAY_START) * PX_PER_MIN }}>
                {fmtHour(h)}
              </div>
            ))}
          </div>
        </div>

        {/* One lane per carer */}
        {staff.length === 0 ? (
          <div className="p-6 text-sm text-gray-400 text-center">No staff to show.</div>
        ) : staff.map((u) => {
          const list = dayShifts.filter((s) => carries(s, u.id));
          const { rowOf, rowCount } = packLane(list);
          const laneH = rowCount * (ROW_H + ROW_GAP) + ROW_GAP;
          const hasClash = list.some((s) => clashIds.has(s.id));
          const isTargetLane = !!preview && preview.targetUserId === u.id && preview.id !== '' &&
            !list.some((s) => s.id === preview.id);
          return (
            <div key={u.id} className="flex border-b border-gray-100 last:border-b-0">
              <div className="shrink-0 sticky left-0 z-20 bg-white border-r border-gray-200 px-3 py-2 flex flex-col justify-center gap-1"
                style={{ width: NAME_W }}>
                <span className="text-sm font-medium text-gray-800 leading-tight">{u.firstName} {u.lastName}</span>
                {hasClash && (
                  <button
                    onClick={() => onFixClashes(u.id)}
                    disabled={fixing}
                    title="Sequence this carer's calls with 5 min travel time between each, removing overlaps"
                    className="self-start text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {fixing ? 'Fixing…' : '⚠ Fix clashes'}
                  </button>
                )}
              </div>
              <div
                data-lane-user={u.id}
                className={`relative ${isTargetLane ? 'bg-blue-50' : ''}`}
                style={{ width: LANE_W, height: laneH }}
              >
                {/* Hour gridlines */}
                {hours.map((h) => (
                  <div key={h} className="absolute top-0 bottom-0 border-l border-gray-100"
                    style={{ left: (h * 60 - DAY_START) * PX_PER_MIN }} />
                ))}
                {/* Call blocks */}
                {list.map((s) => {
                  const dragging = preview?.id === s.id;
                  const startMin = hhmmToMin(s.startTime) + (dragging ? preview!.deltaMin : 0);
                  const dur = shiftMins(s);
                  const left = (startMin - DAY_START) * PX_PER_MIN;
                  const width = Math.max(30, dur * PX_PER_MIN);
                  const top = (rowOf.get(s.id) ?? 0) * (ROW_H + ROW_GAP) + ROW_GAP;
                  const color = s.serviceUser?.site?.color || '#3b82f6';
                  const clash = clashIds.has(s.id);
                  const client = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : (s.visitName || 'Call');
                  return (
                    <div
                      key={s.id}
                      onMouseDown={(e) => startDrag(e, s)}
                      title={`${client} · ${formatTime12h(minToHHMM(startMin))}–${formatTime12h(minToHHMM(startMin + dur))}${clash ? ' · CLASH' : ''}`}
                      className={`absolute rounded px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden cursor-grab active:cursor-grabbing shadow-sm ${clash ? 'ring-2 ring-red-500' : 'ring-1 ring-black/5'} ${dragging ? 'opacity-90 z-30 shadow-lg' : ''} ${!s.published ? 'opacity-90' : ''}`}
                      style={{
                        left, width, top, height: ROW_H,
                        backgroundColor: clash ? '#fee2e2' : `${color}22`,
                        pointerEvents: dragging ? 'none' : 'auto',
                      }}
                    >
                      <div className="font-semibold text-gray-800 truncate">
                        {clash && <span title="Overlapping call">⚠ </span>}
                        {formatTime12h(minToHHMM(startMin))}
                      </div>
                      <div className="truncate text-gray-600">{client}</div>
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="absolute inset-y-0 left-2 flex items-center text-[11px] text-gray-300">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

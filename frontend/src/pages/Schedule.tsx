import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core';
import enGbLocale from '@fullcalendar/core/locales/en-gb';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi, CancelBilling, AssignUndo } from '../api/shifts';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import ShiftModal from '../components/ShiftModal';
import PublishScheduleModal from '../components/PublishScheduleModal';
import { CancelBillingFields, CancelBillingValue, emptyCancelBilling, toCancelBilling } from '../components/CancelBillingFields';
import HospitalIcon from '../components/HospitalIcon';
import { Shift, ServiceUserStatus } from '../types';
import { format, startOfDay, startOfWeek, startOfMonth, endOfMonth, addDays, addMonths } from 'date-fns';
import { formatTime12h } from '../lib/time';

const STATUS_ICON: Record<ServiceUserStatus, string> = {
  ACTIVE: '', ON_HOLD: '⏸️', HOSPITALISED: '', DISCHARGED: '↩️', DECEASED: '⚪',
};
const STATUS_LABEL: Record<ServiceUserStatus, string> = {
  ACTIVE: 'Active', ON_HOLD: 'On Hold', HOSPITALISED: 'Hospitalised', DISCHARGED: 'End of Care', DECEASED: 'Passed Away',
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6366f1'];
function userColor(userId: string | undefined, users: { id: string }[]): string {
  if (!userId) return '#9ca3af';
  const idx = users.findIndex((u) => u.id === userId);
  return COLORS[idx % COLORS.length] || '#3b82f6';
}

function isPastShift(date: string | Date, endTime: string): boolean {
  const d = new Date(date);
  const [eh, em] = endTime.split(':').map(Number);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eh, em, 0);
  return end.getTime() <= Date.now();
}

// Display rank for a shift's site — drives the "group by site, then time"
// ordering across the day-based schedule views. Sites are ranked by the manager-
// set `order`; shifts with no site sort last.
function siteRankOf(s: Shift): number {
  const site = s.serviceUser?.site;
  if (!site) return 1e9;
  return site.order ?? 1e9 - 1;
}

// The exact start moment of a shift = its calendar date + its HH:mm start time.
function shiftStartAt(shiftDate: string | Date, startTime: string): number {
  const d = new Date(shiftDate);
  const [h, m] = (startTime || '00:00').split(':').map(Number);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h || 0, m || 0, 0).getTime();
}

// Resolves the service user's status as it was in effect at a given shift's
// start time, walking the status timeline (entries ascending by effectiveAt).
// Falls back to the legacy single-timestamp field for patients with no
// timeline yet, so existing data still behaves sensibly.
function statusAtShift(su: Shift['serviceUser'], shiftDate: string | Date, startTime: string): ServiceUserStatus | undefined {
  if (!su) return undefined;
  const when = shiftStartAt(shiftDate, startTime);
  const changes = su.statusChanges;
  if (changes && changes.length) {
    let current: ServiceUserStatus = 'ACTIVE';
    for (const c of changes) {
      if (new Date(c.effectiveAt).getTime() <= when) current = c.status;
      else break;
    }
    return current;
  }
  // Legacy fallback: current status applies from statusUpdatedAt onward.
  if (!su.statusUpdatedAt) return su.status;
  return when >= new Date(su.statusUpdatedAt).getTime() ? su.status : 'ACTIVE';
}

function formatDuration(start: string, end: string): string {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  if (mins < 60) return `${mins} mins`;
  const hours = mins / 60;
  if (mins % 60 === 0) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function coverLabel(cover: number): string {
  return cover === 3 ? 'Triple cover' : cover === 2 ? 'Double cover' : 'Single cover';
}

type ViewKey = 'day' | 'week' | '2week' | '4week' | 'month';
const FC_VIEW: Record<ViewKey, string> = {
  day: 'timeGridDay', week: 'dayGridWeek', '2week': 'dayGrid2', '4week': 'dayGrid4', month: 'dayGridMonth',
};

export default function Schedule() {
  const { isManager, user } = useAuth();
  const qc = useQueryClient();
  const calRef = useRef<FullCalendar>(null);

  const [modalOpen, setModalOpen] = useState(false);
  // Persisted zoom for the schedule grid (accessibility — larger text on mobile
  // for managers with eyesight issues). Applied via CSS `zoom` to the content.
  const [zoom, setZoom] = useState(() => {
    const v = Number(localStorage.getItem('caremid.schedule.zoom'));
    return v >= 0.8 && v <= 2 ? v : 1;
  });
  useEffect(() => { localStorage.setItem('caremid.schedule.zoom', String(zoom)); }, [zoom]);
  const zoomBy = (d: number) => setZoom((z) => Math.min(2, Math.max(0.8, Math.round((z + d) * 10) / 10)));
  // The last bulk carer change, kept so an "Undo last change" button stays
  // available even after a reload or navigating away (for up to 30 min).
  const UNDO_KEY = 'caremid.schedule.undo';
  const UNDO_MAX_AGE = 30 * 60 * 1000;
  const [undoInfo, setUndoInfoState] = useState<{ payload: AssignUndo; summary: string; at: number } | null>(() => {
    try {
      const raw = localStorage.getItem(UNDO_KEY);
      const v = raw ? JSON.parse(raw) : null;
      if (v && typeof v.at === 'number' && Date.now() - v.at < UNDO_MAX_AGE) return v;
      if (raw) localStorage.removeItem(UNDO_KEY);
    } catch { /* ignore */ }
    return null;
  });
  const setUndoInfo = (info: { payload: AssignUndo; summary: string } | null) => {
    if (info) {
      const v = { ...info, at: Date.now() };
      setUndoInfoState(v);
      try { localStorage.setItem(UNDO_KEY, JSON.stringify(v)); } catch { /* ignore */ }
    } else {
      setUndoInfoState(null);
      try { localStorage.removeItem(UNDO_KEY); } catch { /* ignore */ }
    }
  };
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [visitFilter, setVisitFilter] = useState<string[]>([]); // selected call types; empty = all
  const [callMenuOpen, setCallMenuOpen] = useState(false);
  const [pubResult, setPubResult] = useState<string | null>(null);
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  const [cancelAllBilling, setCancelAllBilling] = useState<CancelBillingValue>(emptyCancelBilling);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pubMenuOpen, setPubMenuOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const [mode, setMode] = useState<'calendar' | 'carer' | 'list'>('calendar');
  const [viewKey, setViewKey] = useState<ViewKey>('week');
  const [anchor, setAnchor] = useState(new Date());

  // Simple 2-month cap: permanent visits still generate 12 months of shifts in
  // the database, but the schedule only surfaces visits up to ~2 months ahead so
  // the calendar doesn't fill up with far-future rows. Past shifts stay visible.
  const futureHorizon = useMemo(() => addMonths(startOfDay(new Date()), 2), []);

  // Visible date range for the current view (drives the calendar, the summary
  // and — crucially — what we fetch).
  const range = useMemo(() => {
    if (viewKey === 'day') { const start = startOfDay(anchor); return { start, end: addDays(start, 1) }; }
    if (viewKey === 'month') { const start = startOfMonth(anchor); return { start, end: addDays(endOfMonth(anchor), 1) }; }
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const weeks = viewKey === 'week' ? 1 : viewKey === '2week' ? 2 : 4;
    return { start, end: addDays(start, 7 * weeks) };
  }, [anchor, viewKey]);

  // Fetch ONLY the visible range (plus a week's buffer each side for smooth
  // paging), capped at the 2-month future horizon. Previously this loaded a
  // fixed ~3-month window regardless of the view, so on a large rota the browser
  // held ~14k rows — which made loading, publishing, assigning and even
  // rendering sluggish. Scoping to the view keeps the working set small and the
  // whole schedule fast.
  const fetchFrom = format(addDays(range.start, -7), 'yyyy-MM-dd');
  const fetchTo = format(
    new Date(Math.min(futureHorizon.getTime(), addDays(range.end, 7).getTime())),
    'yyyy-MM-dd',
  );

  const { data: shifts = [], isLoading: shiftsLoading } = useQuery({
    queryKey: ['shifts', fetchFrom, fetchTo, isManager ? 'all' : user?.id],
    queryFn: () => shiftsApi.list({ startDate: fetchFrom, endDate: fetchTo, userId: isManager ? undefined : user?.id }),
    placeholderData: (prev) => prev,
    // Live-sync backstop: the socket push can be dropped in production (Vercel
    // doesn't reliably proxy the WebSocket to Render), which left another
    // manager's changes invisible until a manual refresh. Poll every 60s while
    // the tab is focused so the schedule stays current without a refresh (kept
    // modest to limit egress; refetchOnWindowFocus catches changes on return).
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'], queryFn: () => usersApi.list({ active: true }), enabled: isManager,
  });

  const dropMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => shiftsApi.update(id, { date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  const cancelAllMut = useMutation({
    mutationFn: ({ ids, billing }: { ids: string[]; billing?: CancelBilling }) => shiftsApi.cancelBulk(ids, billing),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  const restoreMut = useMutation({
    mutationFn: (payload: AssignUndo) => shiftsApi.restoreAssignments(payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shifts'] }); setUndoInfo(null); },
    onError: () => alert('Could not undo the change. You can re-assign the carer manually.'),
  });
  const publishAllMut = useMutation({
    mutationFn: (v: { ids: string[]; notify: 'none' | 'carers' | 'all'; message: string }) =>
      shiftsApi.publishBulk(v.ids, { notify: v.notify, message: v.message }),
    // Mark the published drafts in place instead of refetching the whole 2-3
    // month window (thousands of rows) after every publish — that reload was
    // what made "Publish" feel slow. Every id sent is already a fully-assigned
    // draft, so they all publish; the 20s poll reconciles anything unexpected.
    // On error we roll back and refetch.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['shifts'] });
      const snapshots = qc.getQueriesData<Shift[]>({ queryKey: ['shifts'] });
      const idSet = new Set(v.ids);
      qc.setQueriesData<Shift[]>({ queryKey: ['shifts'] }, (old) =>
        Array.isArray(old) ? old.map((s) => (idSet.has(s.id) ? { ...s, published: true } : s)) : old,
      );
      return { snapshots };
    },
    onSuccess: (data) => {
      setPublishOpen(false);
      setPubResult(
        data.count > 0
          ? `Published ${data.count}${data.skipped ? ` · ${data.skipped} skipped (need a carer)` : ''}`
          : `Nothing published${data.skipped ? ` · ${data.skipped} still need a carer` : ''}`,
      );
      setTimeout(() => setPubResult(null), 6000);
    },
    onError: (_e, _v, ctx) => {
      ctx?.snapshots.forEach(([key, prev]) => qc.setQueryData(key, prev));
      qc.invalidateQueries({ queryKey: ['shifts'] });
      setPubResult('Publish failed — please retry');
      setTimeout(() => setPubResult(null), 6000);
    },
  });

  const assignedCarers = (s: Shift) => (s.userId ? 1 : 0) + (s.coverCarers?.length ?? 0);
  const neededCarers = (s: Shift) => s.cover || 1;
  const missingCarers = (s: Shift) => Math.max(0, neededCarers(s) - assignedCarers(s));
  // A shift whose service user is not ACTIVE (e.g. hospitalised/discharged) as of that
  // date shouldn't be treated as an unassigned call that needs a carer.
  const patientInactive = (s: Shift) => {
    const st = statusAtShift(s.serviceUser, s.date, s.startTime);
    return !!st && st !== 'ACTIVE';
  };
  const needsStaff = (s: Shift) => missingCarers(s) > 0 && !patientInactive(s);

  const term = search.trim().toLowerCase();
  // Hide calls once a service user has passed away (resolved per shift, so calls
  // from before they passed still show). Belt-and-braces alongside the backend
  // auto-cancel — covers users marked deceased before that shipped, and any
  // future shifts a background job may have regenerated.
  const notCancelled = shifts.filter(
    (s) => s.status !== 'CANCELLED'
      && new Date(s.date) < futureHorizon
      && statusAtShift(s.serviceUser, s.date, s.startTime) !== 'DECEASED',
  );

  // Call-type (visit name) options from what's actually scheduled, ordered by the
  // usual day sequence (Morning → Bed) then any custom names alphabetically.
  const VISIT_ORDER = ['Morning Call', 'Lunch Call', 'Tea Call', 'Bed Call', 'Night Call'];
  const visitNameOptions = useMemo(() => {
    const names = Array.from(new Set(notCancelled.map((s) => s.visitName).filter(Boolean) as string[]));
    return names.sort((a, b) => {
      const ia = VISIT_ORDER.indexOf(a), ib = VISIT_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
  }, [notCancelled]);

  const activeShifts = notCancelled
    .filter((s) => {
      if (assignFilter === 'assigned') return !needsStaff(s);
      if (assignFilter === 'unassigned') return needsStaff(s);
      return true;
    })
    .filter((s) => visitFilter.length === 0 || (s.visitName ? visitFilter.includes(s.visitName) : false))
    .filter((s) => {
      if (!term) return true;
      const names = [
        s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : '',
        s.user ? `${s.user.firstName} ${s.user.lastName}` : '',
        ...(s.coverCarers?.map((c) => `${c.firstName} ${c.lastName}`) ?? []),
      ];
      return names.some((n) => n.toLowerCase().includes(term));
    });

  // Only fully-staffed drafts can be published (the backend skips any shift
  // that still needs a carer), so the "ready" set must match that exactly —
  // otherwise the count never clears. missingCarers === 0 == backend's
  // isFullyAssigned. Under-staffed drafts are counted separately as "need a
  // carer first".
  const draftShown = activeShifts.filter((s) => !s.published && missingCarers(s) === 0);
  const draftUnassignedShown = activeShifts.filter((s) => !s.published && missingCarers(s) > 0).length;
  // Ready drafts falling in the week the calendar is centred on — lets managers
  // publish just this week without publishing the whole loaded range.
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const draftThisWeek = draftShown.filter((s) => { const d = new Date(s.date); return d >= weekStart && d < weekEnd; });

  // True once the visible range reaches the 3-month cap — blocks paging further ahead.
  const atFutureCap = range.end > futureHorizon;

  const rangeShifts = useMemo(
    () => activeShifts.filter((s) => { const d = new Date(s.date); return d >= range.start && d < range.end; }),
    [activeShifts, range],
  );

  const summary = useMemo(() => {
    const total = rangeShifts.length;
    const unassigned = rangeShifts.filter(needsStaff).length;
    const drafts = rangeShifts.filter((s) => !s.published).length;
    const coverage = total ? Math.round(((total - unassigned) / total) * 100) : 100;
    return { total, unassigned, drafts, coverage };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeShifts]);

  // The "Unassigned" filter chip counts the current view (matching the summary
  // tile), not the wider window that's loaded for smooth paging.
  const unassignedCount = summary.unassigned;

  // What the Publish modal acts on: fully-staffed drafts in the visible timeline
  // are what actually get published; the rest are surfaced as counts.
  const readyInRange = useMemo(() => rangeShifts.filter((s) => !s.published && missingCarers(s) === 0), [rangeShifts]);
  const needsCarerInRange = useMemo(() => rangeShifts.filter((s) => !s.published && missingCarers(s) > 0).length, [rangeShifts]);
  // Conflicts: the same carer booked on two overlapping visits within the view.
  const conflictCount = useMemo(() => {
    const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    const byCarer = new Map<string, { id: string; day: string; s: number; e: number }[]>();
    for (const sh of rangeShifts) {
      if (sh.status === 'CANCELLED') continue;
      const carers = [sh.userId, ...(sh.coverCarers?.map((c) => c.id) ?? [])].filter(Boolean) as string[];
      const day = new Date(sh.date).toISOString().slice(0, 10);
      for (const c of carers) {
        if (!byCarer.has(c)) byCarer.set(c, []);
        byCarer.get(c)!.push({ id: sh.id, day, s: toMin(sh.startTime), e: toMin(sh.endTime) });
      }
    }
    const clashing = new Set<string>();
    for (const list of byCarer.values()) {
      list.sort((a, b) => a.day.localeCompare(b.day) || a.s - b.s);
      for (let i = 1; i < list.length; i++) {
        if (list[i].day === list[i - 1].day && list[i].s < list[i - 1].e) { clashing.add(list[i].id); clashing.add(list[i - 1].id); }
      }
    }
    return clashing.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeShifts]);

  const rangeDays = useMemo(() => {
    const days: Date[] = [];
    for (let d = new Date(range.start); d < range.end; d = addDays(d, 1)) days.push(new Date(d));
    return days;
  }, [range]);

  const title = useMemo(() => {
    if (viewKey === 'day') return format(anchor, 'EEEE, dd MMM yyyy');
    if (viewKey === 'month') return format(anchor, 'MMMM yyyy');
    return `${format(range.start, 'dd MMM')} – ${format(addDays(range.end, -1), 'dd MMM yyyy')}`;
  }, [viewKey, anchor, range]);

  // Keep FullCalendar in sync with our own view/date state.
  useEffect(() => {
    const api = calRef.current?.getApi();
    if (api && mode === 'calendar') api.changeView(FC_VIEW[viewKey], anchor);
  }, [viewKey, anchor, mode]);

  // On mobile, FullCalendar fires a spurious dateClick when the app regains
  // focus after you switch away — which would pop the Add Shift modal every
  // time you come back. Record when the page last became visible/focused so
  // dateClick can ignore anything that lands in that window.
  const lastVisibleAt = useRef(0);
  useEffect(() => {
    const mark = () => { lastVisibleAt.current = Date.now(); };
    const onVis = () => { if (document.visibilityState === 'visible') mark(); };
    window.addEventListener('focus', mark);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', mark);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const shiftBy = (dir: number) => {
    if (dir > 0 && atFutureCap) return;
    setAnchor((a) => {
      const d = new Date(a);
      if (viewKey === 'day') d.setDate(d.getDate() + dir);
      else if (viewKey === 'month') d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + dir * 7 * (viewKey === 'week' ? 1 : viewKey === '2week' ? 2 : 4));
      return d;
    });
  };

  const openShift = (s: Shift) => { setSelectedShift(s); setSelectedDate(undefined); setModalOpen(true); };

  const handleDateClick = useCallback((arg: DateClickArg) => {
    if (!isManager) return;
    // Ignore the spurious dateClick FullCalendar fires when the app regains
    // focus (mobile app-switch) — otherwise it opens Add Shift every return.
    if (Date.now() - lastVisibleAt.current < 800) return;
    setSelectedShift(null); setSelectedDate(arg.dateStr); setModalOpen(true);
  }, [isManager]);
  const handleEventClick = useCallback((arg: EventClickArg) => {
    openShift(arg.event.extendedProps.shift as Shift);
  }, []);
  const handleEventDrop = useCallback((arg: EventDropArg) => {
    if (!isManager) { arg.revert(); return; }
    dropMut.mutate({ id: (arg.event.extendedProps.shift as Shift).id, date: arg.event.startStr });
  }, [isManager, dropMut]);

  // Mark the first shift of each new site group within a day so we can draw a
  // separator before it. Mirrors the "site rank, then start time" ordering the
  // calendar itself uses.
  const groupStartIds = useMemo(() => {
    const set = new Set<string>();
    const byDay = new Map<string, Shift[]>();
    for (const s of activeShifts) {
      const k = format(new Date(s.date), 'yyyy-MM-dd');
      const list = byDay.get(k);
      if (list) list.push(s); else byDay.set(k, [s]);
    }
    for (const list of byDay.values()) {
      list.sort((a, b) => (siteRankOf(a) - siteRankOf(b)) || a.startTime.localeCompare(b.startTime));
      for (let i = 1; i < list.length; i++) {
        if (siteRankOf(list[i]) !== siteRankOf(list[i - 1])) set.add(list[i].id);
      }
    }
    return set;
  }, [activeShifts]);

  const events = activeShifts.map((s) => {
    const unassigned = needsStaff(s);
    const baseColor = s.serviceUser?.site?.color || userColor(s.userId, users);
    const dateStr = format(new Date(s.date), 'yyyy-MM-dd');
    return {
      id: s.id,
      title: isManager
        ? `${s.user ? `${s.user.firstName} ${s.user.lastName}` : 'Unassigned'}${s.visitName ? ` · ${s.visitName}` : s.role ? ` · ${s.role}` : ''}`
        : s.visitName || s.role || 'Shift',
      start: `${dateStr}T${s.startTime}:00`,
      end: `${dateStr}T${s.endTime}:00`,
      extendedProps: { shift: s, siteRank: siteRankOf(s) },
      backgroundColor: baseColor,
      borderColor: baseColor,
      textColor: '#000',
      classNames: [
        ...(unassigned ? ['unassigned-shift'] : []),
        ...(!s.published ? ['draft-shift'] : []),
        ...(isPastShift(s.date, s.endTime) ? ['past-shift'] : []),
        ...(groupStartIds.has(s.id) ? ['site-group-start'] : []),
      ],
    };
  });

  function renderEventContent(arg: EventContentArg) {
    const s = arg.event.extendedProps.shift as Shift;
    const patient = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'No patient';
    const unassigned = needsStaff(s);
    const missing = missingCarers(s);
    const patientStatus = statusAtShift(s.serviceUser, s.date, s.startTime);
    const showStatus = !!patientStatus && patientStatus !== 'ACTIVE';
    const statusIcon = showStatus ? STATUS_ICON[patientStatus!] : '';

    // Month packs many days in, so use the same compact two-line box as the time
    // views to avoid tall, scroll-heavy cells. Week and 2 wk keep the full box.
    const vt = arg.view.type;
    const compact = vt.startsWith('timeGrid') || vt === 'dayGridMonth';
    if (compact) {
      return (
        <div className="px-0.5 overflow-hidden leading-tight">
          <p className="text-[11px] font-bold truncate">
            {unassigned && <span title="Unassigned call">⚠ </span>}
            {statusIcon && <span title={STATUS_LABEL[patientStatus!]}>{statusIcon} </span>}
            {patient}
          </p>
          <p className="text-[10px] truncate">
            {formatTime12h(s.startTime)}
            {isManager && unassigned && <span className="font-bold"> · needs {missing}</span>}
            {isManager && !s.published && <span className="font-bold uppercase"> · draft</span>}
          </p>
        </div>
      );
    }
    const carerText = assignedCarers(s) === 0
      ? 'Unassigned'
      : [s.user ? `${s.user.firstName} ${s.user.lastName}` : null, ...(s.coverCarers?.map((c) => `${c.firstName} ${c.lastName}`) ?? [])].filter(Boolean).join(', ');
    const staffLine = [carerText, unassigned ? `needs ${missing} more` : ''].filter(Boolean).join(' · ');
    return (
      <div className="p-0.5 overflow-hidden leading-tight">
        <p className="text-xs font-bold truncate">
          {showStatus && patientStatus === 'HOSPITALISED' && <HospitalIcon className="mr-1 align-middle" />}
          {statusIcon && <span title={STATUS_LABEL[patientStatus!]}>{statusIcon} </span>}
          {patient}
          {isManager && !s.published && (
            <span className="ml-1 text-[9px] font-bold uppercase tracking-wide bg-black/15 px-1 py-0.5 rounded">Draft</span>
          )}
        </p>
        <p className="text-[11px]">
          <span className="font-bold">{formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}</span>
          <span className="opacity-90"> · {formatDuration(s.startTime, s.endTime)}</span>
        </p>
        {isManager && staffLine && (
          <p className={`text-[10px] truncate ${unassigned ? 'font-bold' : 'opacity-90'}`}>{staffLine}</p>
        )}
        {(s.visitName || s.cover > 1) && (
          <p className="text-[10px] font-semibold truncate">
            {[s.visitName, s.cover > 1 ? coverLabel(s.cover) : null].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
    );
  }

  const VIEW_TABS: { k: ViewKey; label: string }[] = [
    { k: 'day', label: 'Day' }, { k: 'week', label: 'Week' }, { k: '2week', label: '2 wk' }, { k: '4week', label: '4 wk' }, { k: 'month', label: 'Month' },
  ];

  // Full-page loading state on first open — the schedule pulls a lot of visits,
  // so hold the page until they're all in rather than rendering it half-built.
  // Date/view navigation keeps the previous data (placeholderData), so this only
  // shows on the initial load.
  if (shiftsLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-40 text-center">
        <div className="animate-spin h-12 w-12 border-4 border-gray-200 border-t-blue-600 rounded-full" />
        <div>
          <p className="text-lg font-semibold text-gray-800">Loading schedule…</p>
          <p className="text-sm text-gray-500 mt-1">Please wait while we load all your visits.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold text-gray-900">Schedule</h1>

      {/* Row 1: navigation + view + add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex">
            <button className="btn-secondary btn btn-sm rounded-r-none" onClick={() => shiftBy(-1)} aria-label="Previous">‹</button>
            <button className="btn-secondary btn btn-sm rounded-l-none border-l-0 disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => shiftBy(1)} disabled={atFutureCap} title={atFutureCap ? 'The schedule only shows up to 2 months ahead' : undefined} aria-label="Next">›</button>
          </div>
          <button className="btn-secondary btn btn-sm" onClick={() => setAnchor(new Date())}>Today</button>
          <div className="inline-flex items-center gap-1.5">
            <input
              type="date"
              value={format(anchor, 'yyyy-MM-dd')}
              onChange={(e) => { if (e.target.value) setAnchor(new Date(e.target.value + 'T00:00:00')); }}
              className="border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-700"
              title="Jump to a date"
              aria-label="Jump to a date"
            />
            <span className="text-sm font-semibold text-blue-600">{format(anchor, 'EEE')}</span>
          </div>
          <span className="font-semibold text-gray-800 ml-1">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            {VIEW_TABS.map((t) => (
              <button
                key={t.k}
                onClick={() => { setViewKey(t.k); }}
                className={`px-3 py-1.5 border-l first:border-l-0 border-gray-200 ${viewKey === t.k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Zoom (accessibility) — scales the schedule grid; tap % to reset. */}
          <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button onClick={() => zoomBy(-0.1)} disabled={zoom <= 0.8} className="px-2.5 py-1.5 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 font-bold" aria-label="Zoom out" title="Zoom out">A−</button>
            <button onClick={() => setZoom(1)} className="px-2 py-1.5 bg-white text-gray-600 hover:bg-gray-50 border-x border-gray-200 tabular-nums" title="Reset zoom">{Math.round(zoom * 100)}%</button>
            <button onClick={() => zoomBy(0.1)} disabled={zoom >= 2} className="px-2.5 py-1.5 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 font-bold" aria-label="Zoom in" title="Zoom in">A+</button>
          </div>
          <button
            onClick={() => setMode((m) => (m === 'list' ? 'calendar' : 'list'))}
            className={`btn btn-sm ${mode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
            title="List view"
          >
            List
          </button>
          {isManager && (
            <button
              onClick={() => setMode((m) => (m === 'carer' ? 'calendar' : 'carer'))}
              className={`btn btn-sm ${mode === 'carer' ? 'btn-primary' : 'btn-secondary'}`}
              title="Toggle carer timeline"
            >
              By carer
            </button>
          )}
          {isManager && (
            <button className="btn-primary btn" onClick={() => { setSelectedShift(null); setSelectedDate(format(anchor, 'yyyy-MM-dd')); setModalOpen(true); }}>
              + Add shift
            </button>
          )}
        </div>
      </div>

      {/* Row 2: search + filters + actions (managers) */}
      {isManager && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search client or carer…" className="input w-56 text-sm" />
            <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden divide-x divide-gray-200">
              {([{ k: 'all', label: 'All' }, { k: 'assigned', label: 'Assigned' }, { k: 'unassigned', label: `Unassigned${unassignedCount ? ` · ${unassignedCount}` : ''}` }] as const).map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setAssignFilter(opt.k)}
                  className={`px-3 py-1.5 text-sm transition-colors ${
                    assignFilter === opt.k
                      ? opt.k === 'unassigned' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                      : `bg-white hover:bg-gray-50 ${opt.k === 'unassigned' && unassignedCount ? 'text-red-600' : 'text-gray-600'}`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Call-type filter — multi-select checkboxes */}
            <div className="relative">
              <button
                onClick={() => setCallMenuOpen((o) => !o)}
                className={`btn btn-sm inline-flex items-center gap-1.5 ${visitFilter.length ? 'btn-primary' : 'btn-secondary'}`}
              >
                {visitFilter.length ? `Call type · ${visitFilter.length}` : 'Call type'}
                <span className="text-xs">▾</span>
              </button>
              {callMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setCallMenuOpen(false)} />
                  <div className="absolute left-0 mt-1 w-56 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-2 text-sm">
                    <div className="flex items-center justify-between px-1 pb-1.5 mb-1 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Call type</span>
                      {visitFilter.length > 0 && (
                        <button className="text-xs text-blue-600 hover:underline" onClick={() => setVisitFilter([])}>Clear</button>
                      )}
                    </div>
                    {visitNameOptions.length === 0 ? (
                      <p className="px-1 py-2 text-gray-400">No calls in view</p>
                    ) : (
                      visitNameOptions.map((name) => (
                        <label key={name} className="flex items-center gap-2 px-1 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={visitFilter.includes(name)}
                            onChange={() => setVisitFilter((cur) => cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name])}
                            className="h-4 w-4 accent-blue-600"
                          />
                          <span className="text-gray-700">{name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {undoInfo && (
              <button
                onClick={() => restoreMut.mutate(undoInfo.payload)}
                disabled={restoreMut.isPending}
                title={undoInfo.summary}
                className="btn-secondary btn inline-flex items-center gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50"
              >
                {restoreMut.isPending ? 'Undoing…' : '↩ Undo last change'}
              </button>
            )}
            <div className="relative">
              <button className="btn-secondary btn" onClick={() => setMenuOpen((o) => !o)} aria-label="More actions">⋯</button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 text-sm">
                    <button className="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 disabled:text-gray-300" disabled={activeShifts.length === 0} onClick={() => { setConfirmCancelAll(true); setMenuOpen(false); }}>
                      Cancel all shown ({activeShifts.length})
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="relative">
              <button className="btn-primary btn" disabled={readyInRange.length === 0 || publishAllMut.isPending} onClick={() => setPublishOpen(true)}>
                Publish{readyInRange.length ? ` [${readyInRange.length}]` : ''}
              </button>
              {pubResult && (
                <div className="absolute right-0 mt-1 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 z-20 shadow-lg">{pubResult}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm bars */}
      {isManager && confirmCancelAll && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 space-y-3 max-w-lg">
          <span className="text-sm text-red-800 font-medium">Cancel all {activeShifts.length} shown shift{activeShifts.length === 1 ? '' : 's'}? This can't be undone.</span>
          <div className="rounded-md border border-red-200 bg-white p-2.5">
            <CancelBillingFields value={cancelAllBilling} onChange={setCancelAllBilling} />
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-danger btn btn-sm" disabled={cancelAllMut.isPending} onClick={() => cancelAllMut.mutate({ ids: activeShifts.map((s) => s.id), billing: toCancelBilling(cancelAllBilling) }, { onSettled: () => { setConfirmCancelAll(false); setCancelAllBilling(emptyCancelBilling); } })}>
              {cancelAllMut.isPending ? 'Cancelling…' : cancelAllBilling.billable ? 'Yes, cancel all (chargeable)' : 'Yes, cancel all'}
            </button>
            <button className="btn-secondary btn btn-sm" onClick={() => setConfirmCancelAll(false)}>No</button>
          </div>
        </div>
      )}

      {/* Zoomable content (summary + grid) — modals stay full size. */}
      <div style={zoom !== 1 ? { zoom } : undefined} className="space-y-3">
      {/* Summary strip */}
      {isManager && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <SummaryTile value={summary.total} label="Visits in view" />
          <SummaryTile value={summary.unassigned} label="Unassigned" tone={summary.unassigned ? 'danger' : undefined} />
          <SummaryTile value={summary.drafts} label="Drafts, not published" tone={summary.drafts ? 'warning' : undefined} />
          <SummaryTile value={`${summary.coverage}%`} label="Coverage filled" tone={summary.coverage >= 90 ? 'success' : summary.coverage >= 75 ? 'warning' : 'danger'} />
        </div>
      )}

      {mode === 'list' ? (
        <ListView
          days={rangeDays}
          shifts={rangeShifts}
          isManager={isManager}
          needsStaff={needsStaff}
          missingCarers={missingCarers}
          onOpen={openShift}
          onAdd={(dateStr) => { setSelectedShift(null); setSelectedDate(dateStr); setModalOpen(true); }}
        />
      ) : mode === 'carer' && isManager ? (
        <CarerTimeline
          users={users}
          days={rangeDays}
          shiftsInRange={rangeShifts}
          needsStaff={needsStaff}
          missingCarers={missingCarers}
          onOpen={openShift}
        />
      ) : mode === 'calendar' && viewKey === '4week' ? (
        <DayColumns
          days={rangeDays}
          shifts={rangeShifts}
          isManager={isManager}
          needsStaff={needsStaff}
          missingCarers={missingCarers}
          onOpen={openShift}
          onAdd={(dateStr) => { setSelectedShift(null); setSelectedDate(dateStr); setModalOpen(true); }}
        />
      ) : (
        <div className="card p-0 overflow-x-auto">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={FC_VIEW[viewKey]}
            initialDate={anchor}
            locale={enGbLocale}
            firstDay={1}
            headerToolbar={false}
            views={{ dayGrid2: { type: 'dayGrid', duration: { weeks: 2 } }, dayGrid4: { type: 'dayGrid', duration: { weeks: 4 } } }}
            dayHeaderContent={(arg) =>
              arg.view.type === 'dayGridWeek' ? format(arg.date, 'EEE, dd-MM-yyyy')
                : arg.view.type.startsWith('dayGrid') ? format(arg.date, 'EEE')
                  : format(arg.date, 'EEE dd-MM')
            }
            events={events}
            eventOrder="siteRank,start"
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            editable={isManager}
            droppable={isManager}
            eventContent={renderEventContent}
            height="calc(100vh - 300px)"
            eventDisplay="block"
            allDaySlot={false}
            slotEventOverlap={false}
            eventMaxStack={3}
            eventMinHeight={26}
            slotMinTime="06:00:00"
            slotMaxTime="23:00:00"
            expandRows
            nowIndicator
            moreLinkClick="popover"
          />
        </div>
      )}
      </div>

      {modalOpen && (
        <ShiftModal
          shift={selectedShift}
          defaultDate={selectedDate}
          onClose={() => { setModalOpen(false); setSelectedShift(null); }}
          onAssignUndo={(payload, summary) => setUndoInfo({ payload, summary })}
        />
      )}

      {publishOpen && (
        <PublishScheduleModal
          rangeLabel={`${format(range.start, 'dd-MM-yyyy')} – ${format(addDays(range.end, -1), 'dd-MM-yyyy')}`}
          readyCount={readyInRange.length}
          needsCarerCount={needsCarerInRange}
          conflictCount={conflictCount}
          isPending={publishAllMut.isPending}
          onClose={() => setPublishOpen(false)}
          onPublish={({ notify, message }) => publishAllMut.mutate({ ids: readyInRange.map((s) => s.id), notify, message })}
        />
      )}
    </div>
  );
}

function SummaryTile({ value, label, tone }: { value: number | string; label: string; tone?: 'danger' | 'warning' | 'success' }) {
  const c = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-green-600' : 'text-gray-900';
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-3 py-1.5 flex items-baseline gap-2">
      <div className={`text-lg font-bold leading-none ${c}`}>{value}</div>
      <div className="text-xs text-gray-500 leading-tight">{label}</div>
    </div>
  );
}

// A horizontal 4-week strip: one narrow column per day (28 across, scroll
// sideways), each listing that day's visits as compact cards. Mirrors the
// reference "day columns" layout so many days are visible without paging.
function DayColumns({ days, shifts, isManager, needsStaff, missingCarers, onOpen, onAdd }: {
  days: Date[];
  shifts: Shift[];
  isManager: boolean;
  needsStaff: (s: Shift) => boolean;
  missingCarers: (s: Shift) => number;
  onOpen: (s: Shift) => void;
  onAdd: (dateStr: string) => void;
}) {
  const dayKey = (d: Date | string) => format(new Date(d), 'yyyy-MM-dd');
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const forDay = (d: Date) =>
    shifts
      .filter((s) => dayKey(s.date) === dayKey(d))
      .sort((a, b) => (siteRankOf(a) - siteRankOf(b)) || a.startTime.localeCompare(b.startTime));

  return (
    <div className="card p-0 overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
      <div className="flex min-w-max">
        {days.map((d) => {
          const list = forDay(d);
          const isToday = dayKey(d) === todayKey;
          return (
            <div key={dayKey(d)} className="w-[132px] shrink-0 border-r border-gray-100 last:border-r-0">
              <div className={`sticky top-0 z-10 border-b px-2 py-1.5 text-center ${isToday ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <div className="text-[11px] font-semibold text-gray-700">{format(d, 'EEE')}</div>
                <div className="text-[11px] text-gray-500">{format(d, 'dd MMM')}</div>
              </div>
              <div className="p-1 space-y-1">
                {list.map((s, i) => {
                  const unassigned = needsStaff(s);
                  const color = s.serviceUser?.site?.color || '#3b82f6';
                  const patient = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'No patient';
                  const carer = s.user ? `${s.user.firstName} ${s.user.lastName}` : null;
                  const groupStart = i > 0 && siteRankOf(s) !== siteRankOf(list[i - 1]);
                  return (
                    <div key={s.id} className={groupStart ? 'mt-5' : ''}>
                    <button
                      onClick={() => onOpen(s)}
                      className={`w-full text-left rounded px-1.5 py-1 text-[10px] leading-tight border ${
                        unassigned ? 'border-dashed border-red-400 bg-red-50 text-red-800' : 'border-transparent text-gray-800'
                      } ${!s.published ? 'opacity-95' : ''}`}
                      style={unassigned ? undefined : { backgroundColor: `${color}22` }}
                    >
                      <div className="font-bold truncate">{formatTime12h(s.startTime)}</div>
                      <div className="truncate">{unassigned && '⚠ '}{patient}</div>
                      <div className="truncate opacity-80">
                        {isManager
                          ? (carer || (unassigned ? `needs ${missingCarers(s)}` : 'Unassigned'))
                          : (s.visitName || 'Visit')}
                        {!s.published && ' · draft'}
                      </div>
                    </button>
                    </div>
                  );
                })}
                {isManager && (
                  <button
                    onClick={() => onAdd(dayKey(d))}
                    className="w-full text-[10px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded py-0.5"
                  >
                    + add
                  </button>
                )}
                {list.length === 0 && !isManager && <div className="text-[10px] text-gray-300 text-center py-2">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Agenda-style list: each day grouped with the shift's site/time, the carers
// working it, and the visit — plus a per-day hours total.
function ListView({ days, shifts, isManager, needsStaff, missingCarers, onOpen, onAdd }: {
  days: Date[];
  shifts: Shift[];
  isManager: boolean;
  needsStaff: (s: Shift) => boolean;
  missingCarers: (s: Shift) => number;
  onOpen: (s: Shift) => void;
  onAdd: (dateStr: string) => void;
}) {
  const dayKey = (d: Date | string) => format(new Date(d), 'yyyy-MM-dd');
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const shiftMins = (s: Shift) => {
    const [sh, sm] = s.startTime.split(':').map(Number);
    const [eh, em] = s.endTime.split(':').map(Number);
    return Math.max(0, (eh * 60 + em) - (sh * 60 + sm));
  };
  const durLabel = (mins: number) => {
    const h = Math.floor(mins / 60); const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  };
  const forDay = (d: Date) =>
    shifts
      .filter((s) => dayKey(s.date) === dayKey(d))
      .sort((a, b) => (siteRankOf(a) - siteRankOf(b)) || a.startTime.localeCompare(b.startTime));

  return (
    <div className="card p-0 overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
      <div className="sticky top-0 z-10 hidden md:grid grid-cols-[1.2fr_1.4fr_1.4fr] gap-4 px-4 py-2 bg-white border-b text-xs font-medium text-gray-500">
        <span>Shift</span><span>Who's Working</span><span>Visit</span>
      </div>
      {days.map((d) => {
        const list = forDay(d);
        const totalMins = list.reduce((a, s) => a + shiftMins(s), 0);
        const isToday = dayKey(d) === todayKey;
        return (
          <div key={dayKey(d)} className="border-b last:border-b-0">
            {/* Day header */}
            <div className={`flex items-center justify-between px-4 py-2 border-b ${isToday ? 'bg-blue-50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold text-gray-800 w-7 text-center">{format(d, 'd')}</span>
                <div className="leading-tight">
                  <p className="font-semibold text-gray-800">{format(d, 'EEEE')}</p>
                  <p className="text-xs text-gray-400">{format(d, 'MMM yyyy')}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500 tabular-nums">⏱ {(totalMins / 60).toFixed(2)}</span>
                {isManager && (
                  <button onClick={() => onAdd(dayKey(d))} className="text-blue-600 text-xl leading-none px-1 hover:text-blue-700" title="Add shift">+</button>
                )}
              </div>
            </div>

            {/* Shifts */}
            {list.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-300">No shifts</p>
            ) : (
              list.map((s) => {
                const unassigned = needsStaff(s);
                const color = s.serviceUser?.site?.color || '#3b82f6';
                const site = s.serviceUser?.site?.name;
                const client = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'No client';
                const carers = [
                  s.user ? `${s.user.firstName} ${s.user.lastName}` : null,
                  ...(s.coverCarers?.map((c) => `${c.firstName} ${c.lastName}`) ?? []),
                ].filter(Boolean) as string[];
                return (
                  <button
                    key={s.id}
                    onClick={() => onOpen(s)}
                    className="w-full text-left grid grid-cols-1 md:grid-cols-[1.2fr_1.4fr_1.4fr] gap-1.5 md:gap-4 px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 items-start"
                  >
                    {/* Shift: colour bar + site/role + time */}
                    <div className="flex gap-2">
                      <span className="w-1 rounded self-stretch shrink-0" style={{ backgroundColor: unassigned ? '#dc2626' : color }} />
                      <div className="min-w-0">
                        {site && <p className="text-sm font-medium" style={{ color }}>{site}{s.role ? ` · ${s.role}` : ''}</p>}
                        <p className="text-sm text-gray-700">{formatTime12h(s.startTime)} – {formatTime12h(s.endTime)} · {durLabel(shiftMins(s))}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          {!s.published && <span className="inline-block text-[10px] font-bold text-amber-600 bg-amber-50 px-1 rounded">DRAFT</span>}
                          {s.run && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${s.run.color || '#6b7280'}1a`, color: s.run.color || '#374151' }}>
                              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.run.color || '#6b7280' }} />
                              {s.run.name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Who's working */}
                    <div className="text-sm min-w-0">
                      {carers.length > 0
                        ? carers.map((c, i) => <p key={i} className="text-gray-700 truncate">{c}</p>)
                        : <p className={unassigned ? 'text-red-600 font-medium' : 'text-gray-400'}>{unassigned ? `Unassigned · needs ${missingCarers(s)}` : 'Unassigned'}</p>}
                    </div>
                    {/* Visit */}
                    <div className="text-sm text-gray-800 min-w-0">
                      {client}{s.visitName ? ` ${s.visitName}` : ''}{s.cover > 1 ? ` ×${s.cover}` : ''}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}

function CarerTimeline({ users, days, shiftsInRange, needsStaff, missingCarers, onOpen }: {
  users: { id: string; firstName: string; lastName: string }[];
  days: Date[];
  shiftsInRange: Shift[];
  needsStaff: (s: Shift) => boolean;
  missingCarers: (s: Shift) => number;
  onOpen: (s: Shift) => void;
}) {
  const dayKey = (d: Date | string) => format(new Date(d), 'yyyy-MM-dd');
  const carriesUser = (s: Shift, uid: string) => s.userId === uid || (s.coverCarers?.some((c) => c.id === uid) ?? false);

  // Rows come from whoever is actually assigned to the visible visits — not just
  // the active-carer list. A carer who's been deactivated but still holds
  // upcoming shifts is missing from `users`, yet must still show here (their
  // visits appear in the calendar). Prefer the `users` object for a consistent
  // name, else fall back to the carer embedded on the shift.
  const byId = new Map(users.map((u) => [u.id, u] as const));
  const carerMap = new Map<string, { id: string; firstName: string; lastName: string }>();
  for (const s of shiftsInRange) {
    if (s.userId && s.user) carerMap.set(s.userId, byId.get(s.userId) ?? { id: s.userId, firstName: s.user.firstName, lastName: s.user.lastName });
    for (const c of s.coverCarers ?? []) carerMap.set(c.id, byId.get(c.id) ?? { id: c.id, firstName: c.firstName, lastName: c.lastName });
  }
  const activeUsers = [...carerMap.values()].sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, undefined, { sensitivity: 'base' }));
  const unassigned = shiftsInRange.filter(needsStaff);

  const cell = (list: Shift[], unassignedRow: boolean) => (
    <div className="flex flex-col gap-1 p-1 min-h-[52px]">
      {list.sort((a, b) => a.startTime.localeCompare(b.startTime)).map((s) => {
        const color = s.serviceUser?.site?.color || '#3b82f6';
        const patient = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'No patient';
        return (
          <button
            key={s.id}
            onClick={() => onOpen(s)}
            className={`text-left rounded px-1.5 py-1 text-[11px] leading-tight ${unassignedRow ? 'border border-dashed border-red-400 bg-red-50 text-red-700' : 'text-gray-800'} ${!s.published ? 'opacity-90' : ''}`}
            style={unassignedRow ? undefined : { backgroundColor: `${color}22` }}
          >
            <div className="font-semibold truncate">{formatTime12h(s.startTime)} {patient}</div>
            <div className="truncate opacity-80">
              {s.visitName || 'Visit'}{unassignedRow ? ` · needs ${missingCarers(s)}` : ''}{!s.published ? ' · draft' : ''}
            </div>
          </button>
        );
      })}
    </div>
  );

  const gridCols = { gridTemplateColumns: `160px repeat(${days.length}, minmax(120px, 1fr))` };

  return (
    <div className="card p-0 overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)' }}>
      <div className="min-w-max">
        {/* Header — pinned to the top while scrolling so the dates stay visible. */}
        <div className="grid border-b border-gray-200 bg-gray-50 sticky top-0 z-20" style={gridCols}>
          <div className="px-3 py-2 text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 z-30">Carer</div>
          {days.map((d) => (
            <div key={dayKey(d)} className="px-2 py-2 text-xs font-medium text-gray-600 text-center border-l border-gray-100">{format(d, 'EEE dd/MM')}</div>
          ))}
        </div>

        {/* Unassigned row */}
        {unassigned.length > 0 && (
          <div className="grid border-b border-gray-100" style={gridCols}>
            <div className="px-3 py-2 text-sm font-medium text-red-700 sticky left-0 bg-white z-10 flex items-center">⚠ Unassigned</div>
            {days.map((d) => (
              <div key={dayKey(d)} className="border-l border-gray-100">{cell(unassigned.filter((s) => dayKey(s.date) === dayKey(d)), true)}</div>
            ))}
          </div>
        )}

        {/* One row per carer */}
        {activeUsers.length === 0 && unassigned.length === 0 ? (
          <div className="p-6 text-sm text-gray-400 text-center">No visits in this range.</div>
        ) : activeUsers.map((u, i) => {
          // Zebra-band alternate carers plus a bold divider so each carer's
          // block reads as one group even when rows are very uneven in height.
          // The sticky name cell must carry the same opaque stripe colour so
          // shift cells don't show through it when scrolling sideways.
          const stripe = i % 2 ? 'bg-gray-50' : 'bg-white';
          return (
            <div key={u.id} className={`grid border-b-2 border-gray-200 mb-1.5 ${stripe}`} style={gridCols}>
              <div className={`px-3 py-2 text-sm font-medium text-gray-800 sticky left-0 z-10 flex items-center ${stripe}`}>{u.firstName} {u.lastName}</div>
              {days.map((d) => (
                <div key={dayKey(d)} className="border-l border-gray-100">{cell(shiftsInRange.filter((s) => carriesUser(s, u.id) && dayKey(s.date) === dayKey(d)), false)}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

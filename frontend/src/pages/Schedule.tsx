import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin, { DateClickArg } from '@fullcalendar/interaction';
import { EventClickArg, EventContentArg, EventDropArg } from '@fullcalendar/core';
import enGbLocale from '@fullcalendar/core/locales/en-gb';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftsApi } from '../api/shifts';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import ShiftModal from '../components/ShiftModal';
import HospitalIcon from '../components/HospitalIcon';
import { Shift, ServiceUserStatus } from '../types';
import { format, startOfDay, startOfWeek, startOfMonth, endOfMonth, addDays, addMonths } from 'date-fns';
import { formatTime12h } from '../lib/time';

const STATUS_ICON: Record<ServiceUserStatus, string> = {
  ACTIVE: '', ON_HOLD: '⏸️', HOSPITALISED: '', DISCHARGED: '↩️', DECEASED: '⚪',
};
const STATUS_LABEL: Record<ServiceUserStatus, string> = {
  ACTIVE: 'Active', ON_HOLD: 'On Hold', HOSPITALISED: 'Hospitalised', DISCHARGED: 'Discharged', DECEASED: 'Passed Away',
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
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [assignFilter, setAssignFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [confirmCancelAll, setConfirmCancelAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pubMenuOpen, setPubMenuOpen] = useState(false);

  const [mode, setMode] = useState<'calendar' | 'carer'>('calendar');
  const [viewKey, setViewKey] = useState<ViewKey>('week');
  const [anchor, setAnchor] = useState(new Date());

  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts'],
    queryFn: () => shiftsApi.list({ userId: isManager ? undefined : user?.id }),
  });
  const { data: users = [] } = useQuery({
    queryKey: ['users'], queryFn: () => usersApi.list({ active: true }), enabled: isManager,
  });

  const dropMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => shiftsApi.update(id, { date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  const cancelAllMut = useMutation({
    mutationFn: (ids: string[]) => shiftsApi.cancelBulk(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
  const publishAllMut = useMutation({
    mutationFn: (ids: string[]) => shiftsApi.publishBulk(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
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

  // Simple 2-month cap: permanent visits still generate 12 months of shifts in
  // the database, but the schedule only surfaces visits up to ~2 months ahead so
  // the calendar doesn't fill up with far-future rows. Past shifts stay visible.
  const futureHorizon = useMemo(() => addMonths(startOfDay(new Date()), 2), []);

  const term = search.trim().toLowerCase();
  const notCancelled = shifts.filter((s) => s.status !== 'CANCELLED' && new Date(s.date) < futureHorizon);
  const unassignedCount = notCancelled.filter(needsStaff).length;

  const activeShifts = notCancelled
    .filter((s) => {
      if (assignFilter === 'assigned') return !needsStaff(s);
      if (assignFilter === 'unassigned') return needsStaff(s);
      return true;
    })
    .filter((s) => {
      if (!term) return true;
      const names = [
        s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : '',
        s.user ? `${s.user.firstName} ${s.user.lastName}` : '',
        ...(s.coverCarers?.map((c) => `${c.firstName} ${c.lastName}`) ?? []),
      ];
      return names.some((n) => n.toLowerCase().includes(term));
    });

  const draftShown = activeShifts.filter((s) => !s.published && !needsStaff(s));
  const draftUnassignedShown = activeShifts.filter((s) => !s.published && needsStaff(s)).length;
  // Ready drafts falling in the week the calendar is centred on — lets managers
  // publish just this week without publishing the whole loaded range.
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const draftThisWeek = draftShown.filter((s) => { const d = new Date(s.date); return d >= weekStart && d < weekEnd; });

  // Visible date range for the current view (drives the summary + carer grid).
  const range = useMemo(() => {
    if (viewKey === 'day') { const start = startOfDay(anchor); return { start, end: addDays(start, 1) }; }
    if (viewKey === 'month') { const start = startOfMonth(anchor); return { start, end: addDays(endOfMonth(anchor), 1) }; }
    const start = startOfWeek(anchor, { weekStartsOn: 1 });
    const weeks = viewKey === 'week' ? 1 : viewKey === '2week' ? 2 : 4;
    return { start, end: addDays(start, 7 * weeks) };
  }, [anchor, viewKey]);

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
    setSelectedShift(null); setSelectedDate(arg.dateStr); setModalOpen(true);
  }, [isManager]);
  const handleEventClick = useCallback((arg: EventClickArg) => {
    openShift(arg.event.extendedProps.shift as Shift);
  }, []);
  const handleEventDrop = useCallback((arg: EventDropArg) => {
    if (!isManager) { arg.revert(); return; }
    dropMut.mutate({ id: (arg.event.extendedProps.shift as Shift).id, date: arg.event.startStr });
  }, [isManager, dropMut]);

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
      extendedProps: { shift: s },
      backgroundColor: baseColor,
      borderColor: unassigned ? '#dc2626' : baseColor,
      textColor: '#000',
      classNames: [
        ...(unassigned ? ['unassigned-shift'] : []),
        ...(!s.published ? ['draft-shift'] : []),
        ...(isPastShift(s.date, s.endTime) ? ['past-shift'] : []),
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

    // Multi-week grids (2 wk / 4 wk / Month) pack many days in, so use the same
    // compact two-line box as the time views to avoid tall, scroll-heavy cells.
    const vt = arg.view.type;
    const compact = vt.startsWith('timeGrid') || vt === 'dayGrid2' || vt === 'dayGrid4' || vt === 'dayGridMonth';
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
    return (
      <div className="p-0.5 overflow-hidden leading-tight">
        <p className="text-xs font-bold truncate">
          {unassigned && <span title="Unassigned call">⚠ </span>}
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
        {isManager && (
          <p className={`text-[10px] truncate ${unassigned ? 'font-bold' : 'opacity-90'}`}>
            {assignedCarers(s) === 0
              ? 'Unassigned'
              : [s.user ? `${s.user.firstName} ${s.user.lastName}` : null, ...(s.coverCarers?.map((c) => `${c.firstName} ${c.lastName}`) ?? [])].filter(Boolean).join(', ')}
            {unassigned && ` · needs ${missing} more`}
          </p>
        )}
        {(s.visitName || s.cover > 1) && (
          <p className="text-[10px] font-semibold truncate">
            {[s.visitName, s.cover > 1 ? coverLabel(s.cover) : null].filter(Boolean).join(' · ')}
          </p>
        )}
        {s.serviceUser?.site && <p className="text-[10px] opacity-90 truncate">{s.serviceUser.site.name}</p>}
      </div>
    );
  }

  const VIEW_TABS: { k: ViewKey; label: string }[] = [
    { k: 'day', label: 'Day' }, { k: 'week', label: 'Week' }, { k: '2week', label: '2 wk' }, { k: '4week', label: '4 wk' }, { k: 'month', label: 'Month' },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>

      {/* Row 1: navigation + view + add */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex">
            <button className="btn-secondary btn btn-sm rounded-r-none" onClick={() => shiftBy(-1)} aria-label="Previous">‹</button>
            <button className="btn-secondary btn btn-sm rounded-l-none border-l-0 disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => shiftBy(1)} disabled={atFutureCap} title={atFutureCap ? 'The schedule only shows up to 2 months ahead' : undefined} aria-label="Next">›</button>
          </div>
          <button className="btn-secondary btn btn-sm" onClick={() => setAnchor(new Date())}>Today</button>
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
          {isManager && (
            <button
              onClick={() => setMode((m) => (m === 'calendar' ? 'carer' : 'calendar'))}
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
          </div>
          <div className="flex items-center gap-2">
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
              <button className="btn-primary btn" disabled={draftShown.length === 0} onClick={() => setPubMenuOpen((o) => !o)}>
                Publish <span className="ml-1 text-xs">▾</span>
              </button>
              {pubMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setPubMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1 text-sm">
                    <p className="px-3 pt-1.5 pb-1 text-xs font-medium text-gray-400">Publish drafts to the carer app</p>
                    <button className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent" disabled={draftThisWeek.length === 0 || publishAllMut.isPending} onClick={() => publishAllMut.mutate(draftThisWeek.map((s) => s.id), { onSettled: () => setPubMenuOpen(false) })}>
                      <span>Publish this week</span><span className="text-gray-400">{draftThisWeek.length}</span>
                    </button>
                    <button className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-transparent" disabled={draftShown.length === 0 || publishAllMut.isPending} onClick={() => publishAllMut.mutate(draftShown.map((s) => s.id), { onSettled: () => setPubMenuOpen(false) })}>
                      <span>Publish all ready</span><span className="text-gray-400">{draftShown.length}</span>
                    </button>
                    {publishAllMut.isPending && <p className="px-3 py-2 text-xs text-gray-500">Publishing…</p>}
                    {draftUnassignedShown > 0 && !publishAllMut.isPending && (
                      <p className="px-3 py-2 mt-1 border-t border-gray-100 text-xs text-amber-600">{draftUnassignedShown} more need a carer first</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirm bars */}
      {isManager && confirmCancelAll && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2">
          <span className="text-sm text-red-800">Cancel all {activeShifts.length} shown shift{activeShifts.length === 1 ? '' : 's'}? This can't be undone.</span>
          <button className="btn-danger btn btn-sm" disabled={cancelAllMut.isPending} onClick={() => cancelAllMut.mutate(activeShifts.map((s) => s.id), { onSettled: () => setConfirmCancelAll(false) })}>
            {cancelAllMut.isPending ? 'Cancelling…' : 'Yes, cancel all'}
          </button>
          <button className="btn-secondary btn btn-sm" onClick={() => setConfirmCancelAll(false)}>No</button>
        </div>
      )}

      {/* Summary strip */}
      {isManager && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryTile value={summary.total} label="Visits in view" />
          <SummaryTile value={summary.unassigned} label="Unassigned" tone={summary.unassigned ? 'danger' : undefined} />
          <SummaryTile value={summary.drafts} label="Drafts, not published" tone={summary.drafts ? 'warning' : undefined} />
          <SummaryTile value={`${summary.coverage}%`} label="Coverage filled" tone={summary.coverage >= 90 ? 'success' : summary.coverage >= 75 ? 'warning' : 'danger'} />
        </div>
      )}

      {mode === 'carer' && isManager ? (
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
        <div className="card p-0 overflow-hidden">
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
            eventOrder="start"
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

      {modalOpen && (
        <ShiftModal
          shift={selectedShift}
          defaultDate={selectedDate}
          onClose={() => { setModalOpen(false); setSelectedShift(null); }}
        />
      )}
    </div>
  );
}

function SummaryTile({ value, label, tone }: { value: number | string; label: string; tone?: 'danger' | 'warning' | 'success' }) {
  const c = tone === 'danger' ? 'text-red-600' : tone === 'warning' ? 'text-amber-600' : tone === 'success' ? 'text-green-600' : 'text-gray-900';
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-4 py-2.5">
      <div className={`text-xl font-bold ${c}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
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
    shifts.filter((s) => dayKey(s.date) === dayKey(d)).sort((a, b) => a.startTime.localeCompare(b.startTime));

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
                {list.map((s) => {
                  const unassigned = needsStaff(s);
                  const color = s.serviceUser?.site?.color || '#3b82f6';
                  const patient = s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'No patient';
                  const carer = s.user ? `${s.user.firstName} ${s.user.lastName}` : null;
                  return (
                    <button
                      key={s.id}
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

  // Only carers with at least one visit in range keep the grid readable.
  const activeUsers = users.filter((u) => shiftsInRange.some((s) => carriesUser(s, u.id)));
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
    <div className="card p-0 overflow-x-auto">
      <div className="min-w-max">
        {/* Header */}
        <div className="grid border-b border-gray-200 bg-gray-50 sticky top-0" style={gridCols}>
          <div className="px-3 py-2 text-xs font-medium text-gray-500 sticky left-0 bg-gray-50 z-10">Carer</div>
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
        ) : activeUsers.map((u) => (
          <div key={u.id} className="grid border-b border-gray-50" style={gridCols}>
            <div className="px-3 py-2 text-sm font-medium text-gray-800 sticky left-0 bg-white z-10 flex items-center">{u.firstName} {u.lastName}</div>
            {days.map((d) => (
              <div key={dayKey(d)} className="border-l border-gray-100">{cell(shiftsInRange.filter((s) => carriesUser(s, u.id) && dayKey(s.date) === dayKey(d)), false)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

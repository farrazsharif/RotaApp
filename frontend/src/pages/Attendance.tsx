import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clockApi } from '../api/clock';
import { usersApi } from '../api/users';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { ClockRecord, Shift } from '../types';
import { format, differenceInMinutes, startOfWeek, endOfWeek, subDays, subWeeks } from 'date-fns';
import { formatTime12h } from '../lib/time';

function duration(record: ClockRecord) {
  if (!record.clockOut) return 'In progress';
  const mins = differenceInMinutes(new Date(record.clockOut), new Date(record.clockIn));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// The scheduled start of the visit this record belongs to.
function shiftStart(r: ClockRecord): Date | null {
  if (!r.shift) return null;
  const base = new Date(r.shift.date);
  const [sh, sm] = r.shift.startTime.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), sh, sm, 0);
}

// The scheduled end of the visit this record belongs to, accounting for
// overnight calls (end earlier than start rolls to the next day). Used to
// distinguish a carer still on a live visit from a forgotten clock-out, and to
// pre-fill a sensible manual clock-out time.
function shiftEnd(r: ClockRecord): Date | null {
  if (!r.shift) return null;
  const base = new Date(r.shift.date);
  const [sh, sm] = r.shift.startTime.split(':').map(Number);
  const [eh, em] = r.shift.endTime.split(':').map(Number);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), eh, em, 0);
  if (eh * 60 + em <= sh * 60 + sm) end.setDate(end.getDate() + 1);
  return end;
}

// An open record whose visit finished more than 15 min ago is very likely a
// forgotten clock-out rather than a live visit.
function isMissedClockOut(r: ClockRecord): boolean {
  if (r.clockOut) return false;
  const end = shiftEnd(r);
  return !!end && Date.now() > end.getTime() + 15 * 60 * 1000;
}

// Under this many minutes on a completed visit is flagged for review.
const SHORT_VISIT_MINUTES = 15;

// The planned length of the visit this record belongs to, in minutes
// (overnight-aware). null when the record isn't tied to a shift.
function plannedMinutes(r: ClockRecord): number | null {
  if (!r.shift) return null;
  const [sh, sm] = r.shift.startTime.split(':').map(Number);
  const [eh, em] = r.shift.endTime.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins;
}

// A completed visit where the carer was clocked in for under 15 minutes — far
// short of a normal care call — worth keeping an eye on. Genuine short pop-ins
// (planned under 15 min) are left alone.
function isShortVisit(r: ClockRecord): boolean {
  if (!r.clockOut) return false;
  const actual = differenceInMinutes(new Date(r.clockOut), new Date(r.clockIn));
  if (actual >= SHORT_VISIT_MINUTES) return false;
  const planned = plannedMinutes(r);
  return planned === null || planned >= SHORT_VISIT_MINUTES;
}

const dtLocal = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

// Scheduled start/end of a shift (overnight-aware), for spotting missed visits.
function scheduledStart(s: Shift): Date {
  const base = new Date(s.date);
  const [h, m] = s.startTime.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0);
}
function scheduledEnd(s: Shift): Date {
  const base = new Date(s.date);
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), eh, em, 0);
  if (eh * 60 + em <= sh * 60 + sm) end.setDate(end.getDate() + 1);
  return end;
}

export default function Attendance() {
  const { isManager } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canEdit = can('manage_schedule');
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [carerId, setCarerId] = useState('');
  const [preset, setPreset] = useState<'today' | 'yesterday' | 'thisweek' | 'lastweek' | 'custom'>('thisweek');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'short' | 'missed'>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [inValue, setInValue] = useState('');
  const [outValue, setOutValue] = useState('');

  // Quick date-range presets. Weeks run Monday–Sunday, matching the default.
  function applyPreset(p: 'today' | 'yesterday' | 'thisweek' | 'lastweek') {
    const now = new Date();
    if (p === 'today') {
      const d = format(now, 'yyyy-MM-dd');
      setStartDate(d); setEndDate(d);
    } else if (p === 'yesterday') {
      const d = format(subDays(now, 1), 'yyyy-MM-dd');
      setStartDate(d); setEndDate(d);
    } else if (p === 'thisweek') {
      setStartDate(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setEndDate(format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    } else {
      const lw = subWeeks(now, 1);
      setStartDate(format(startOfWeek(lw, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setEndDate(format(endOfWeek(lw, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    }
    setPreset(p);
  }

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['clock-records', startDate, endDate, carerId],
    queryFn: () => clockApi.records({ startDate, endDate, userId: carerId || undefined }),
  });

  // Scheduled visits in the same window, so we can surface ones that were never
  // attended (assigned, already over, but with no clock-in) as "Missed".
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', 'attendance', startDate, endDate, carerId],
    queryFn: () => shiftsApi.list({ startDate, endDate, userId: carerId || undefined }),
  });

  const { data: carers = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
    enabled: isManager,
  });

  const saveMut = useMutation({
    mutationFn: ({ id, clockIn, clockOut }: { id: string; clockIn?: string; clockOut?: string }) =>
      clockApi.updateRecord(id, { clockIn, clockOut }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-records'] });
      setEditingId(null);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg || 'Could not save the clock times. Please try again.');
    },
  });

  // Opens the inline editor. For an open record (no clock-out) the clock-out is
  // pre-filled to the visit's scheduled end if that's passed, else now.
  function startEdit(r: ClockRecord) {
    setInValue(dtLocal(new Date(r.clockIn)));
    if (r.clockOut) {
      setOutValue(dtLocal(new Date(r.clockOut)));
    } else {
      const end = shiftEnd(r);
      const suggested = end && end.getTime() <= Date.now() ? end : new Date();
      setOutValue(dtLocal(suggested));
    }
    setEditingId(r.id);
  }

  // One-click fix for the "carer forgot to adjust the time" case: fill both
  // fields with the visit's scheduled start and end.
  function applyPlanned(r: ClockRecord) {
    const start = shiftStart(r);
    const end = shiftEnd(r);
    if (start) setInValue(dtLocal(start));
    if (end) setOutValue(dtLocal(end));
  }

  function saveEdit(r: ClockRecord) {
    if (!inValue || !outValue) return;
    saveMut.mutate({
      id: r.id,
      clockIn: new Date(inValue).toISOString(),
      clockOut: new Date(outValue).toISOString(),
    });
  }

  const totalHours = records.reduce((sum, r) => {
    if (!r.clockOut) return sum;
    return sum + differenceInMinutes(new Date(r.clockOut), new Date(r.clockIn)) / 60;
  }, 0);
  const missingCount = records.filter((r) => !r.clockOut).length;
  const shortCount = records.filter(isShortVisit).length;

  // Missed visits: an assigned, non-cancelled shift whose scheduled end has
  // passed but that has no clock-in at all. When a carer is selected these are
  // that carer's own shifts; otherwise a shift nobody clocked into.
  const attendedShiftIds = new Set(records.map((r) => r.shift?.id).filter(Boolean) as string[]);
  const isAssigned = (s: Shift) => !!s.userId || (s.coverCarers?.length ?? 0) > 0;
  const now = Date.now();
  const missedShifts = shifts.filter(
    (s) => s.status !== 'CANCELLED' && isAssigned(s) && !attendedShiftIds.has(s.id) && scheduledEnd(s).getTime() < now,
  );
  const missedCount = missedShifts.length;

  const selectedCarerName = (() => {
    const c = carerId ? carers.find((x) => x.id === carerId) : null;
    return c ? `${c.firstName} ${c.lastName}` : '';
  })();
  const missedCarerName = (s: Shift) =>
    selectedCarerName || (s.user ? `${s.user.firstName} ${s.user.lastName}` : (s.coverCarers?.[0] ? `${s.coverCarers[0].firstName} ${s.coverCarers[0].lastName}` : '—'));

  // Unified, newest-first row list. Clock records and missed visits share the
  // table; the status filter narrows which appear (stats above still summarise
  // the whole period).
  type Row = { key: string; t: number; kind: 'rec'; rec: ClockRecord } | { key: string; t: number; kind: 'missed'; shift: Shift };
  const recRows: Row[] = records.map((r) => ({ key: r.id, t: new Date(r.clockIn).getTime(), kind: 'rec', rec: r }));
  const missedRows: Row[] = missedShifts.map((s) => ({ key: `missed-${s.id}`, t: scheduledStart(s).getTime(), kind: 'missed', shift: s }));
  let rows: Row[];
  if (statusFilter === 'missed') rows = missedRows;
  else if (statusFilter === 'missing') rows = recRows.filter((x) => x.kind === 'rec' && !x.rec.clockOut);
  else if (statusFilter === 'short') rows = recRows.filter((x) => x.kind === 'rec' && isShortVisit(x.rec));
  else rows = [...recRows, ...missedRows];
  rows = rows.sort((a, b) => b.t - a.t);

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {([
              { k: 'today', label: 'Today' },
              { k: 'yesterday', label: 'Yesterday' },
              { k: 'thisweek', label: 'This week' },
              { k: 'lastweek', label: 'Last week' },
            ] as const).map((r) => (
              <button
                key={r.k}
                onClick={() => applyPreset(r.k)}
                className={`px-3 py-1.5 border-l first:border-l-0 border-gray-200 ${preset === r.k ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {isManager && (
            <div className="sm:ml-auto inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
              {([
                { k: 'all', label: 'All', on: 'bg-gray-900 text-white' },
                { k: 'missed', label: `Missed${missedCount ? ` (${missedCount})` : ''}`, on: 'bg-red-600 text-white' },
                { k: 'missing', label: `No clock-out${missingCount ? ` (${missingCount})` : ''}`, on: 'bg-amber-600 text-white' },
                { k: 'short', label: `Short visits${shortCount ? ` (${shortCount})` : ''}`, on: 'bg-red-600 text-white' },
              ] as const).map((s) => (
                <button
                  key={s.k}
                  onClick={() => setStatusFilter(s.k)}
                  className={`px-3 py-1.5 border-l first:border-l-0 border-gray-200 ${statusFilter === s.k ? s.on : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">From</label>
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPreset('custom'); }} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPreset('custom'); }} className="input" />
        </div>
        {isManager && (
          <div>
            <label className="label">Carer</label>
            <select value={carerId} onChange={(e) => setCarerId(e.target.value)} className="input min-w-[12rem]">
              <option value="">All carers</option>
              {carers.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </div>
        )}
        <div className="ml-auto flex gap-6 text-right">
          {isManager && missedCount > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Missed</p>
              <p className="text-2xl font-bold text-red-600">{missedCount}</p>
            </div>
          )}
          {isManager && missingCount > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">No clock-out</p>
              <p className="text-2xl font-bold text-amber-600">{missingCount}</p>
            </div>
          )}
          {isManager && shortCount > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Short visits</p>
              <p className="text-2xl font-bold text-red-600">{shortCount}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Hours</p>
            <p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}h</p>
          </div>
        </div>
        </div>
      </div>

      {records.length === 0 && missedShifts.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">⏱️</p>
          <p>No clock records or missed visits for this period</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {isManager && <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock In</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Patient / Call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 && (
                <tr><td colSpan={isManager ? 6 : 5} className="px-4 py-10 text-center text-gray-400">No records match this filter.</td></tr>
              )}
              {rows.map((row) => {
                if (row.kind === 'missed') {
                  const s = row.shift;
                  return (
                    <tr key={row.key} className="bg-red-50 hover:bg-red-100/60">
                      {isManager && <td className="px-4 py-3 font-medium">{missedCarerName(s)}</td>}
                      <td className="px-4 py-3 text-gray-600">{format(scheduledStart(s), 'EEE dd MMM')}</td>
                      <td className="px-4 py-3"><span className="badge-red badge">Missed</span></td>
                      <td className="px-4 py-3 text-gray-400">—</td>
                      <td className="px-4 py-3 text-gray-400">—</td>
                      <td className="px-4 py-3 text-gray-500">
                        {s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName} · ` : ''}
                        {s.visitName ? `${s.visitName} · ` : ''}{formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}
                      </td>
                    </tr>
                  );
                }
                const r = row.rec;
                const missed = isMissedClockOut(r);
                const short = isShortVisit(r);
                const editing = editingId === r.id;

                // Editing spans the whole row so both time fields have room.
                if (editing) {
                  return (
                    <tr key={r.id} className="bg-blue-50">
                      <td colSpan={isManager ? 6 : 5} className="px-4 py-3">
                        <div className="flex flex-wrap items-end gap-3">
                          {isManager && <div className="text-sm font-medium text-gray-800 mr-1">{r.user.firstName} {r.user.lastName}</div>}
                          <div>
                            <label className="label text-xs">Clock In</label>
                            <input type="datetime-local" value={inValue} max={dtLocal(new Date())} onChange={(e) => setInValue(e.target.value)} className="input py-1 text-xs" />
                          </div>
                          <div>
                            <label className="label text-xs">Clock Out</label>
                            <input type="datetime-local" value={outValue} max={dtLocal(new Date())} onChange={(e) => setOutValue(e.target.value)} className="input py-1 text-xs" />
                          </div>
                          {r.shift && (
                            <button onClick={() => applyPlanned(r)} className="btn-secondary btn btn-sm" title="Fill in the scheduled visit start and end">
                              Use planned times
                            </button>
                          )}
                          <button onClick={() => saveEdit(r)} disabled={saveMut.isPending} className="btn-primary btn btn-sm">
                            {saveMut.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${missed ? 'bg-amber-50' : short ? 'bg-red-50' : ''}`}>
                    {isManager && (
                      <td className="px-4 py-3 font-medium">{r.user.firstName} {r.user.lastName}</td>
                    )}
                    <td className="px-4 py-3 text-gray-600">{format(new Date(r.clockIn), 'EEE dd MMM')}</td>
                    <td className="px-4 py-3">{format(new Date(r.clockIn), 'h:mm a')}</td>
                    <td className="px-4 py-3">
                      {r.clockOut ? (
                        format(new Date(r.clockOut), 'h:mm a')
                      ) : (
                        <span className={missed ? 'badge-yellow badge' : 'badge-green badge'}>
                          {missed ? 'No clock-out' : 'Active'}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 py-3 font-medium ${short ? 'text-red-600' : 'text-blue-600'}`}>
                      {duration(r)}
                      {short && <span className="ml-2 badge-red badge" title={`Under ${SHORT_VISIT_MINUTES} min on a longer planned visit`}>Short</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {r.shift
                            ? `${r.shift.serviceUser ? `${r.shift.serviceUser.firstName} ${r.shift.serviceUser.lastName} · ` : ''}${formatTime12h(r.shift.startTime)}–${formatTime12h(r.shift.endTime)}`
                            : '—'}
                        </span>
                        {canEdit && (
                          <button onClick={() => startEdit(r)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            {r.clockOut ? 'Edit' : 'Clock out →'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

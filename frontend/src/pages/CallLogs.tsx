import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callLogsApi } from '../api/callLogs';
import { serviceUsersApi } from '../api/serviceUsers';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import { CallLog, CallLogSignature, Shift } from '../types';
import { format, startOfWeek, endOfWeek, subWeeks, subDays } from 'date-fns';
import { formatTime12h } from '../lib/time';

// Scheduled start/end of a shift (overnight-aware) — for the missing-logs view.
function schedStart(s: Shift): Date {
  const b = new Date(s.date);
  const [h, m] = s.startTime.split(':').map(Number);
  return new Date(b.getFullYear(), b.getMonth(), b.getDate(), h, m, 0);
}
function schedEnd(s: Shift): Date {
  const b = new Date(s.date);
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  const e = new Date(b.getFullYear(), b.getMonth(), b.getDate(), eh, em, 0);
  if (eh * 60 + em <= sh * 60 + sm) e.setDate(e.getDate() + 1);
  return e;
}
const shiftCarer = (s: Shift): string =>
  s.user ? `${s.user.firstName} ${s.user.lastName}` : (s.coverCarers?.[0] ? `${s.coverCarers[0].firstName} ${s.coverCarers[0].lastName}` : 'Unassigned');

// Parse the shared-log signatures (JSON) for double/triple-up calls.
function signaturesFor(log: CallLog): CallLogSignature[] {
  if (!log.signedBy) return [];
  try { const v = JSON.parse(log.signedBy); return Array.isArray(v) ? v : []; } catch { return []; }
}

interface Group {
  id: string;
  name: string;
  logs: CallLog[];
}

// Find the clock-in/out session the carer was in when they wrote this log —
// the session that was open (or most recently closed) at the time of writing.
function clockTimesFor(log: CallLog): { clockIn: string; clockOut?: string } | null {
  const records = log.shift?.clockRecords?.filter((r) => r.userId === log.user?.id) ?? [];
  if (records.length === 0) return null;
  const createdTs = +new Date(log.createdAt);
  const matching = records.find((r) => +new Date(r.clockIn) <= createdTs && (!r.clockOut || +new Date(r.clockOut) >= createdTs));
  const record = matching || [...records].sort((a, b) => +new Date(b.clockIn) - +new Date(a.clockIn))[0];
  return { clockIn: record.clockIn, clockOut: record.clockOut };
}

function durationLabel(clockIn: string, clockOut?: string): string | null {
  if (!clockOut) return null;
  const mins = Math.round((+new Date(clockOut) - +new Date(clockIn)) / 60000);
  if (mins < 60) return `${mins} mins`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} ${h === 1 ? 'hour' : 'hours'}` : `${h}h ${m}m`;
}

export default function CallLogs() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [serviceUserId, setServiceUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [preset, setPreset] = useState<'today' | 'thisweek' | 'lastweek' | 'custom'>('custom');

  // Quick date-range presets. Weeks run Monday–Sunday.
  function applyPreset(p: 'today' | 'thisweek' | 'lastweek') {
    const now = new Date();
    if (p === 'today') {
      const d = format(now, 'yyyy-MM-dd');
      setFrom(d); setTo(d);
    } else if (p === 'thisweek') {
      setFrom(format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setTo(format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    } else {
      const lw = subWeeks(now, 1);
      setFrom(format(startOfWeek(lw, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
      setTo(format(endOfWeek(lw, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
    }
    setPreset(p);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [mode, setMode] = useState<'logs' | 'missing'>('logs');
  const [addingShiftId, setAddingShiftId] = useState<string | null>(null);
  const [addNote, setAddNote] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['call-logs', 'all'],
    queryFn: () => callLogsApi.list(),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => callLogsApi.update(id, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => callLogsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      setConfirmDeleteId(null);
    },
  });

  const { data: serviceUsers = [] } = useQuery({
    queryKey: ['service-users', '', ''],
    queryFn: () => serviceUsersApi.list(),
  });

  // Missing-logs view: scheduled shifts in the window with no call log. Bound the
  // shift fetch to the chosen range, defaulting to the last 7 days.
  const effFrom = from || format(subDays(new Date(), 7), 'yyyy-MM-dd');
  const effTo = to || format(new Date(), 'yyyy-MM-dd');
  const { data: shifts = [] } = useQuery({
    queryKey: ['shifts', 'missing-logs', effFrom, effTo, serviceUserId],
    queryFn: () => shiftsApi.list({ startDate: effFrom, endDate: effTo, serviceUserId: serviceUserId || undefined }),
    enabled: mode === 'missing',
  });

  const createMut = useMutation({
    mutationFn: ({ shift, note }: { shift: Shift; note: string }) =>
      callLogsApi.createManage({ serviceUserId: shift.serviceUserId!, shiftId: shift.id, note, asUserId: shift.userId || shift.coverCarers?.[0]?.id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['call-logs'] });
      qc.invalidateQueries({ queryKey: ['shifts', 'missing-logs'] });
      setAddingShiftId(null);
      setAddNote('');
    },
  });

  const term = search.trim().toLowerCase();

  // Shifts (assigned, over, not cancelled) that have no call log yet.
  const loggedShiftIds = useMemo(() => new Set(logs.map((l) => l.shift?.id).filter(Boolean) as string[]), [logs]);
  const missingShifts = useMemo(() => {
    const now = Date.now();
    return shifts
      .filter((s) =>
        s.status !== 'CANCELLED' &&
        (!!s.userId || (s.coverCarers?.length ?? 0) > 0) &&
        schedEnd(s).getTime() < now &&
        !loggedShiftIds.has(s.id) &&
        (!term || [s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : '', shiftCarer(s), s.visitName || ''].join(' ').toLowerCase().includes(term)))
      .sort((a, b) => schedStart(b).getTime() - schedStart(a).getTime());
  }, [shifts, loggedShiftIds, term]);

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(from + 'T00:00:00').getTime() : null;
    const toTs = to ? new Date(to + 'T23:59:59').getTime() : null;
    return logs.filter((l) => {
      if (serviceUserId && l.serviceUser?.id !== serviceUserId) return false;
      const ts = new Date(l.createdAt).getTime();
      if (fromTs !== null && ts < fromTs) return false;
      if (toTs !== null && ts > toTs) return false;
      if (term) {
        const hay = [
          l.serviceUser ? `${l.serviceUser.firstName} ${l.serviceUser.lastName}` : '',
          l.user ? `${l.user.firstName} ${l.user.lastName}` : '',
          l.note,
        ].join(' ').toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [logs, serviceUserId, from, to, term]);

  // Single flat list, strictly newest-first by date and time — no client grouping.
  const sorted = useMemo(
    () => [...filtered].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [filtered],
  );

  // Grouped by service user — used only for the PDF export, which reads better organised by client.
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const l of sorted) {
      const id = l.serviceUser?.id || 'unknown';
      const name = l.serviceUser ? `${l.serviceUser.firstName} ${l.serviceUser.lastName}` : 'Unknown client';
      if (!map.has(id)) map.set(id, { id, name, logs: [] });
      map.get(id)!.logs.push(l);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => +new Date(b.logs[0].createdAt) - +new Date(a.logs[0].createdAt));
    return arr;
  }, [sorted]);

  const clearFilters = () => { setSearch(''); setServiceUserId(''); setFrom(''); setTo(''); setPreset('custom'); };
  const hasFilters = !!(search || serviceUserId || from || to);

  function exportPdf() {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const su = serviceUserId ? serviceUsers.find((s) => s.id === serviceUserId) : null;
    const rangeLabel = [
      su ? `Client: ${su.firstName} ${su.lastName}` : 'All clients',
      from ? `From ${format(new Date(from), 'dd MMM yyyy')}` : null,
      to ? `To ${format(new Date(to), 'dd MMM yyyy')}` : null,
    ].filter(Boolean).join(' · ');

    const body = groups.map((g) => `
      <h2>${esc(g.name)} <span class="count">(${g.logs.length})</span></h2>
      ${g.logs.map((l) => `
        <div class="log">
          <div class="meta">
            <span>${esc(l.user ? `${l.user.firstName} ${l.user.lastName}` : 'Unknown carer')}</span>
            <span>${format(new Date(l.createdAt), 'EEE dd MMM yyyy, h:mm a')}</span>
          </div>
          ${l.shift ? `<div class="visit">Visit time ${esc(formatTime12h(l.shift.startTime))}–${esc(formatTime12h(l.shift.endTime))}${l.shift.visitName ? ` · ${esc(l.shift.visitName)}` : ''}</div>` : ''}
          ${(() => {
            const ct = clockTimesFor(l);
            if (!ct) return '';
            const dur = ct.clockOut ? durationLabel(ct.clockIn, ct.clockOut) : null;
            const txt = `Actual: clocked in ${format(new Date(ct.clockIn), 'h:mm a')}${ct.clockOut ? ` – out ${format(new Date(ct.clockOut), 'h:mm a')}` : ' (still clocked in)'}${dur ? ` · ${dur} on call` : ''}`;
            return `<div class="visit">${esc(txt)}</div>`;
          })()}
          ${(() => {
            const sigs = signaturesFor(l);
            if (sigs.length < 2) return '';
            return `<div class="visit">Signed by: ${esc(sigs.map((s) => `${s.firstName} ${s.lastName}`).join(', '))}</div>`;
          })()}
          <div class="note">${esc(l.note)}</div>
        </div>
      `).join('')}
    `).join('');

    const html = `<!DOCTYPE html><html><head><title>Call Logs</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 32px; }
        h1 { font-size: 20px; margin: 0 0 4px; }
        .sub { color: #666; font-size: 12px; margin-bottom: 20px; }
        h2 { font-size: 15px; border-bottom: 2px solid #2563eb; padding-bottom: 4px; margin: 22px 0 8px; }
        .count { color: #888; font-weight: normal; font-size: 12px; }
        .log { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; margin-bottom: 8px; page-break-inside: avoid; }
        .meta { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin-bottom: 3px; }
        .meta span:first-child { font-weight: bold; color: #222; }
        .visit { font-size: 11px; color: #777; margin-bottom: 3px; }
        .note { font-size: 13px; white-space: pre-wrap; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <h1>Call Logs</h1>
      <div class="sub">${esc(rangeLabel)} · ${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'} · Generated ${format(new Date(), 'dd MMM yyyy, h:mm a')}</div>
      ${body || '<p>No call logs match the current filters.</p>'}
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to export the PDF.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Call Logs</h1>
        <button className="btn-primary btn" onClick={exportPdf} disabled={filtered.length === 0}>Export PDF</button>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {([
            { k: 'logs', label: 'Logs' },
            { k: 'missing', label: `Missing logs${mode === 'missing' && missingShifts.length ? ` (${missingShifts.length})` : ''}` },
          ] as const).map((m) => (
            <button
              key={m.k}
              onClick={() => setMode(m.k)}
              className={`px-3 py-1.5 border-l first:border-l-0 border-gray-200 ${mode === m.k ? (m.k === 'missing' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white') : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm ml-2">
          {([
            { k: 'today', label: 'Today' },
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
        <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Client (call)</label>
          <select value={serviceUserId} onChange={(e) => setServiceUserId(e.target.value)} className="input w-56">
            <option value="">All service users</option>
            {[...serviceUsers]
              .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, undefined, { sensitivity: 'base' }))
              .map((s) => (
                <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
              ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} className="input" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, carer or note…" className="input w-full" />
        </div>
        {hasFilters && <button className="btn-secondary btn" onClick={clearFilters}>Clear</button>}
        </div>
      </div>

      {mode === 'missing' ? (
        <p className="text-sm text-gray-500">
          {missingShifts.length} shift{missingShifts.length === 1 ? '' : 's'} with no call log · {format(new Date(effFrom), 'dd MMM')}–{format(new Date(effTo), 'dd MMM yyyy')}
        </p>
      ) : (
        <p className="text-sm text-gray-500">
          {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} across {groups.length} service user{groups.length === 1 ? '' : 's'}
        </p>
      )}

      {mode === 'missing' ? (
        missingShifts.length === 0 ? (
          <div className="card text-center py-12 text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p>No missing call logs in this period — every past visit has a log.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {missingShifts.map((s) => (
              <div key={s.id} className="card border-l-4 border-red-300">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'Client'}
                    <span className="ml-2 badge-red badge">No log</span>
                  </p>
                  <span className="text-xs text-gray-500">{format(schedStart(s), 'EEE dd MMM yyyy')}</span>
                </div>
                <p className="text-sm font-medium text-gray-700">Carer: {shiftCarer(s)}</p>
                <p className="text-xs text-gray-500 mb-2">
                  Visit time {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)}{s.visitName ? ` · ${s.visitName}` : ''}
                </p>
                {addingShiftId === s.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={addNote}
                      onChange={(e) => setAddNote(e.target.value)}
                      rows={3}
                      className="input w-full"
                      placeholder="What the carer did on this visit… (entered by office — carer had no signal)"
                    />
                    <div className="flex gap-2">
                      <button
                        className="btn-primary btn btn-sm"
                        disabled={!addNote.trim() || createMut.isPending}
                        onClick={() => createMut.mutate({ shift: s, note: addNote.trim() })}
                      >
                        {createMut.isPending ? 'Saving…' : 'Save log'}
                      </button>
                      <button className="btn-secondary btn btn-sm" onClick={() => { setAddingShiftId(null); setAddNote(''); }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="text-sm font-medium text-blue-600 hover:underline" onClick={() => { setAddingShiftId(s.id); setAddNote(''); }}>
                    + Add call log
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : sorted.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No call logs found</div>
      ) : (
        <div className="space-y-3">
          {sorted.map((log) => (
            <div key={log.id} className="card">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">
                  {log.serviceUser ? `${log.serviceUser.firstName} ${log.serviceUser.lastName}` : 'Unknown client'}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{format(new Date(log.createdAt), 'EEE dd MMM yyyy, h:mm a')}</span>
                  {isAdmin && editingId !== log.id && (
                    <>
                      <button
                        className="text-xs text-blue-600 hover:underline"
                        onClick={() => { setEditingId(log.id); setEditNote(log.note); }}
                      >
                        Edit
                      </button>
                      {confirmDeleteId === log.id ? (
                        <span className="flex items-center gap-1">
                          <span className="text-xs text-red-700">Delete?</span>
                          <button
                            className="text-xs font-semibold text-red-600 hover:underline"
                            disabled={deleteMut.isPending}
                            onClick={() => deleteMut.mutate(log.id)}
                          >
                            Yes
                          </button>
                          <button className="text-xs text-gray-500 hover:underline" onClick={() => setConfirmDeleteId(null)}>No</button>
                        </span>
                      ) : (
                        <button className="text-xs text-red-600 hover:underline" onClick={() => setConfirmDeleteId(log.id)}>
                          Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">
                Carer: {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown'}
              </p>
              {log.shift && (
                <p className="text-xs text-gray-500">
                  Visit time {formatTime12h(log.shift.startTime)}–{formatTime12h(log.shift.endTime)}{log.shift.visitName ? ` · ${log.shift.visitName}` : ''}
                </p>
              )}
              {(() => {
                const ct = clockTimesFor(log);
                if (!ct) return null;
                const dur = ct.clockOut ? durationLabel(ct.clockIn, ct.clockOut) : null;
                return (
                  <p className="text-xs text-gray-500 mb-2">
                    Actual: clocked in {format(new Date(ct.clockIn), 'h:mm a')}
                    {ct.clockOut ? ` – out ${format(new Date(ct.clockOut), 'h:mm a')}` : ' (still clocked in)'}
                    {dur ? ` · ${dur} on call` : ''}
                  </p>
                );
              })()}
              {(() => {
                const sigs = signaturesFor(log);
                if (sigs.length < 2) return null;
                return (
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-500">Signed by:</span>
                    {sigs.map((s) => (
                      <span key={s.userId} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium" title={`Signed ${format(new Date(s.signedAt), 'dd MMM yyyy, h:mm a')}`}>
                        {s.firstName} {s.lastName} ✓
                      </span>
                    ))}
                  </div>
                );
              })()}
              {editingId === log.id ? (
                <div className="space-y-2">
                  <textarea
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={3}
                    className="input w-full"
                  />
                  <div className="flex gap-2">
                    <button
                      className="btn-primary btn btn-sm"
                      disabled={!editNote.trim() || updateMut.isPending}
                      onClick={() => updateMut.mutate({ id: log.id, note: editNote.trim() })}
                    >
                      {updateMut.isPending ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn-secondary btn btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

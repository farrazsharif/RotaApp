import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callLogsApi } from '../api/callLogs';
import { serviceUsersApi } from '../api/serviceUsers';
import { useAuth } from '../contexts/AuthContext';
import { CallLog } from '../types';
import { format } from 'date-fns';

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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  const term = search.trim().toLowerCase();

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

  const clearFilters = () => { setSearch(''); setServiceUserId(''); setFrom(''); setTo(''); };
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
            <span>${format(new Date(l.createdAt), 'EEE dd MMM yyyy, HH:mm')}</span>
          </div>
          ${l.shift ? `<div class="visit">Visit time ${esc(l.shift.startTime)}–${esc(l.shift.endTime)}${l.shift.visitName ? ` · ${esc(l.shift.visitName)}` : ''}</div>` : ''}
          ${(() => {
            const ct = clockTimesFor(l);
            if (!ct) return '';
            const dur = ct.clockOut ? durationLabel(ct.clockIn, ct.clockOut) : null;
            const txt = `Actual: clocked in ${format(new Date(ct.clockIn), 'HH:mm')}${ct.clockOut ? ` – out ${format(new Date(ct.clockOut), 'HH:mm')}` : ' (still clocked in)'}${dur ? ` · ${dur} on call` : ''}`;
            return `<div class="visit">${esc(txt)}</div>`;
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
      <div class="sub">${esc(rangeLabel)} · ${filtered.length} entr${filtered.length === 1 ? 'y' : 'ies'} · Generated ${format(new Date(), 'dd MMM yyyy, HH:mm')}</div>
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
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Client (call)</label>
          <select value={serviceUserId} onChange={(e) => setServiceUserId(e.target.value)} className="input w-56">
            <option value="">All service users</option>
            {serviceUsers.map((s) => (
              <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="label">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, carer or note…" className="input w-full" />
        </div>
        {hasFilters && <button className="btn-secondary btn" onClick={clearFilters}>Clear</button>}
      </div>

      <p className="text-sm text-gray-500">
        {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'} across {groups.length} service user{groups.length === 1 ? '' : 's'}
      </p>

      {sorted.length === 0 ? (
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
                  <span className="text-xs text-gray-500">{format(new Date(log.createdAt), 'EEE dd MMM yyyy, HH:mm')}</span>
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
                  Visit time {log.shift.startTime}–{log.shift.endTime}{log.shift.visitName ? ` · ${log.shift.visitName}` : ''}
                </p>
              )}
              {(() => {
                const ct = clockTimesFor(log);
                if (!ct) return null;
                const dur = ct.clockOut ? durationLabel(ct.clockIn, ct.clockOut) : null;
                return (
                  <p className="text-xs text-gray-500 mb-2">
                    Actual: clocked in {format(new Date(ct.clockIn), 'HH:mm')}
                    {ct.clockOut ? ` – out ${format(new Date(ct.clockOut), 'HH:mm')}` : ' (still clocked in)'}
                    {dur ? ` · ${dur} on call` : ''}
                  </p>
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

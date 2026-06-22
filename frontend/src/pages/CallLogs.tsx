import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callLogsApi } from '../api/callLogs';
import { serviceUsersApi } from '../api/serviceUsers';
import { CallLog } from '../types';
import { format } from 'date-fns';

interface Group {
  id: string;
  name: string;
  logs: CallLog[];
}

export default function CallLogs() {
  const [search, setSearch] = useState('');
  const [serviceUserId, setServiceUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['call-logs', 'all'],
    queryFn: () => callLogsApi.list(),
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

  // Group by service user, sorted alphabetically; logs within a group newest-first.
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const l of filtered) {
      const id = l.serviceUser?.id || 'unknown';
      const name = l.serviceUser ? `${l.serviceUser.firstName} ${l.serviceUser.lastName}` : 'Unknown client';
      if (!map.has(id)) map.set(id, { id, name, logs: [] });
      map.get(id)!.logs.push(l);
    }
    const arr = Array.from(map.values());
    arr.forEach((g) => g.logs.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)));
    arr.sort((a, b) => a.name.localeCompare(b.name));
    return arr;
  }, [filtered]);

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
          ${l.shift ? `<div class="visit">Visit ${esc(l.shift.startTime)}–${esc(l.shift.endTime)}${l.shift.visitName ? ` · ${esc(l.shift.visitName)}` : ''}</div>` : ''}
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

      {groups.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No call logs found</div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="flex items-center gap-2 mb-2 border-b border-gray-200 pb-1">
                <h2 className="font-semibold text-gray-900">{g.name}</h2>
                <span className="text-xs text-gray-400">{g.logs.length} log{g.logs.length === 1 ? '' : 's'}</span>
              </div>
              <div className="space-y-3">
                {g.logs.map((log) => (
                  <div key={log.id} className="card">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-700">
                        Carer: {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown'}
                      </p>
                      <span className="text-xs text-gray-500">{format(new Date(log.createdAt), 'EEE dd MMM yyyy, HH:mm')}</span>
                    </div>
                    {log.shift && (
                      <p className="text-xs text-gray-500 mb-2">
                        Visit {log.shift.startTime}–{log.shift.endTime}{log.shift.visitName ? ` · ${log.shift.visitName}` : ''}
                      </p>
                    )}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.note}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

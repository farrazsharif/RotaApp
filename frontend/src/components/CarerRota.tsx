import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, addDays } from 'date-fns';
import { shiftsApi } from '../api/shifts';
import { Shift } from '../types';

// A carer's upcoming rota (primary + cover calls) over a date range — defaults
// to the next 4 weeks — with Download CSV and Print / Save-as-PDF so a manager
// can send it to the carer. Read-only; nothing here changes the schedule.
export default function CarerRota({ userId, staffName }: { userId: string; staffName: string }) {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const [from, setFrom] = useState(format(monday, 'yyyy-MM-dd'));
  const [to, setTo] = useState(format(addDays(monday, 27), 'yyyy-MM-dd'));

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ['carer-rota', userId, from, to],
    queryFn: () => shiftsApi.list({ userId, startDate: from, endDate: to, includeCover: true }),
    enabled: !!userId && !!from && !!to,
  });

  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const durMin = (s: Shift) => { let d = toMin(s.endTime) - toMin(s.startTime); if (d < 0) d += 24 * 60; return d; };

  const rota = shifts
    .filter((s) => s.status !== 'CANCELLED' && s.published !== false)
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)));

  const totalHours = rota.reduce((sum, s) => sum + durMin(s), 0) / 60;
  const clientOf = (s: Shift) => (s.serviceUser ? `${s.serviceUser.firstName} ${s.serviceUser.lastName}` : 'Unassigned client');

  const byDay = new Map<string, Shift[]>();
  for (const s of rota) {
    const key = s.date.slice(0, 10);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(s);
  }
  const days = [...byDay.keys()].sort();

  const rangeLabel = `${format(new Date(from), 'd MMM yyyy')} – ${format(new Date(to), 'd MMM yyyy')}`;

  function downloadCsv() {
    const head = ['Date', 'Day', 'Start', 'End', 'Client', 'Visit', 'Address', 'Postcode', 'Hours'];
    const esc = (v: string | number) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [head.join(',')];
    for (const s of rota) {
      lines.push([
        format(new Date(s.date), 'dd/MM/yyyy'), format(new Date(s.date), 'EEE'),
        s.startTime, s.endTime, clientOf(s), s.visitName || '',
        s.serviceUser?.address || '', s.serviceUser?.postcode || '', (durMin(s) / 60).toFixed(2),
      ].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rota_${staffName.replace(/\s+/g, '-')}_${from}_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function printRota() {
    const rows = days.map((d) => {
      const items = byDay.get(d)!.map((s) => `
        <tr>
          <td>${s.startTime}–${s.endTime}</td>
          <td>${clientOf(s)}</td>
          <td>${s.visitName || ''}</td>
          <td>${s.serviceUser?.postcode || ''}</td>
        </tr>`).join('');
      return `<tr class="dayhdr"><td colspan="4">${format(new Date(d), 'EEEE d MMM yyyy')}</td></tr>${items}`;
    }).join('');
    const html = `<!doctype html><html><head><title>Rota — ${staffName}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#555;font-size:13px;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #e5e7eb}
        th{background:#1d4ed8;color:#fff}
        tr.dayhdr td{background:#f3f4f6;font-weight:bold}
        @media print{button{display:none}}
      </style></head><body>
      <h1>Rota — ${staffName}</h1>
      <p class="sub">${rangeLabel} · ${rota.length} visit(s) · ${totalHours.toFixed(1)} hours</p>
      <table><thead><tr><th>Time</th><th>Client</th><th>Visit</th><th>Postcode</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No visits in this period.</td></tr>'}</tbody></table>
      <script>window.onload=function(){window.print()}</script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="input" />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="input" />
          </div>
          <button className="btn-secondary btn" onClick={() => { setFrom(format(monday, 'yyyy-MM-dd')); setTo(format(addDays(monday, 27), 'yyyy-MM-dd')); }}>
            Next 4 weeks
          </button>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn" disabled={rota.length === 0} onClick={downloadCsv}>Download CSV</button>
          <button className="btn-primary btn" disabled={rota.length === 0} onClick={printRota}>Print / Save as PDF</button>
        </div>
      </div>

      <p className="text-sm text-gray-500">{rangeLabel} · {rota.length} visit{rota.length === 1 ? '' : 's'} · {totalHours.toFixed(1)} hours</p>

      {isLoading ? (
        <div className="flex justify-center p-6"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
      ) : rota.length === 0 ? (
        <p className="text-sm text-gray-400">No published visits for {staffName} in this period.</p>
      ) : (
        <div className="space-y-4">
          {days.map((d) => (
            <div key={d}>
              <p className="text-sm font-bold text-gray-800 mb-1.5">{format(new Date(d), 'EEEE d MMM yyyy')}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <tbody className="divide-y">
                    {byDay.get(d)!.map((s) => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="p-2 text-gray-600 whitespace-nowrap w-32">{s.startTime}–{s.endTime}</td>
                        <td className="p-2 font-medium text-gray-900">{clientOf(s)}</td>
                        <td className="p-2 text-gray-500">{s.visitName || ''}</td>
                        <td className="p-2 text-gray-500 whitespace-nowrap">{s.serviceUser?.postcode || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

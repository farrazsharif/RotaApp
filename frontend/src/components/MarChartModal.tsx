import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { medicationsApi } from '../api/medications';
import { ServiceUser, Medication, MedAdministration, MedStatus } from '../types';
import { format, getDaysInMonth, parse } from 'date-fns';
import { formatTime12h } from '../lib/time';

interface Props {
  serviceUser: Pick<ServiceUser, 'id' | 'firstName' | 'lastName'>;
  onClose: () => void;
}

// Single-letter codes for anything other than "given" — given doses are
// signed with the carer's initials, same convention as a paper MAR chart.
const STATUS_CODE: Record<MedStatus, string> = {
  GIVEN: '', REFUSED: 'R', MISSED: 'M', NOT_NEEDED: 'N', SELF_ADMIN: 'S',
};
const STATUS_LABEL: Record<MedStatus, string> = {
  GIVEN: 'Given (carer initials)', REFUSED: 'Refused', MISSED: 'Missed', NOT_NEEDED: 'Not needed', SELF_ADMIN: 'Self-administered',
};
const STATUS_COLOR: Record<MedStatus, string> = {
  GIVEN: '#15803d', REFUSED: '#b45309', MISSED: '#b91c1c', NOT_NEEDED: '#6b7280', SELF_ADMIN: '#1d4ed8',
};

function parseTimes(times: string): string[] {
  try {
    const a = JSON.parse(times);
    return Array.isArray(a) ? a.sort() : [];
  } catch {
    return [];
  }
}

function initialsFor(rec: MedAdministration): string {
  if (rec.status !== 'GIVEN') return STATUS_CODE[rec.status];
  if (!rec.user) return '✓';
  return `${rec.user.firstName[0]}${rec.user.lastName[0]}`.toUpperCase();
}

export default function MarChartModal({ serviceUser, onClose }: Props) {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));

  const monthDate = parse(month, 'yyyy-MM', new Date());
  const daysInMonth = getDaysInMonth(monthDate);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const startDate = format(monthDate, 'yyyy-MM-01');
  const endDate = format(new Date(monthDate.getFullYear(), monthDate.getMonth(), daysInMonth), 'yyyy-MM-dd');

  const { data: meds = [] } = useQuery({
    queryKey: ['medications', serviceUser.id],
    queryFn: () => medicationsApi.list(serviceUser.id),
  });

  const { data: admins = [] } = useQuery({
    queryKey: ['med-admin-range', serviceUser.id, month],
    queryFn: () => medicationsApi.administrationsRange(serviceUser.id, startDate, endDate),
  });

  // Dose times are stored as the server's wall-clock time, encoded as if it
  // were UTC (the server runs in UTC) — must build the comparison the same
  // way, or this silently shifts by the browser's UTC offset (e.g. during BST).
  const recordFor = (medicationId: string, day: number, time: string) => {
    const [h, m] = time.split(':').map(Number);
    const target = Date.UTC(monthDate.getFullYear(), monthDate.getMonth(), day, h, m, 0);
    return admins.find((a) => a.medicationId === medicationId && new Date(a.scheduledFor).getTime() === target);
  };

  const charts = useMemo(
    () => meds.map((med: Medication) => ({ med, times: parseTimes(med.times) })),
    [meds]
  );

  function exportPdf() {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c));
    const monthLabel = format(monthDate, 'MMMM yyyy');

    const tables = charts.map(({ med, times }) => `
      <h2>${esc(med.name)}${med.dose ? ` · ${esc(med.dose)}` : ''}${med.route ? ` · ${esc(med.route)}` : ''}</h2>
      ${med.instructions ? `<p class="instructions">${esc(med.instructions)}</p>` : ''}
      <table>
        <thead>
          <tr><th class="time-col">TIME</th>${days.map((d) => `<th>${d}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${times.length === 0
            ? `<tr><td class="time-col">PRN</td>${days.map(() => '<td></td>').join('')}</tr>`
            : times.map((t) => `
              <tr>
                <td class="time-col">${esc(formatTime12h(t))}</td>
                ${days.map((d) => {
                  const rec = recordFor(med.id, d, t);
                  if (!rec) return '<td></td>';
                  const code = esc(initialsFor(rec));
                  const color = STATUS_COLOR[rec.status];
                  return `<td style="color:${color};font-weight:bold;" title="${esc(STATUS_LABEL[rec.status])}">${code}</td>`;
                }).join('')}
              </tr>
            `).join('')
          }
        </tbody>
      </table>
      <div class="dates-row">
        <span>Date Commenced: ${med.startDate ? esc(format(new Date(med.startDate), 'dd MMM yyyy')) : '—'}</span>
        <span>Date Discontinued: ${med.endDate ? esc(format(new Date(med.endDate), 'dd MMM yyyy')) : '—'}</span>
      </div>
    `).join('<div class="page-break"></div>');

    const html = `<!DOCTYPE html><html><head><title>MAR Chart</title>
      <style>
        @page { size: landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; color: #111; margin: 16px; }
        h1 { font-size: 18px; margin: 0 0 2px; }
        .sub { color: #555; font-size: 12px; margin-bottom: 16px; }
        h2 { font-size: 14px; margin: 16px 0 4px; }
        .instructions { font-size: 11px; color: #666; margin: 0 0 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #333; text-align: center; padding: 4px 2px; }
        .time-col { text-align: left; font-weight: bold; white-space: nowrap; padding-left: 6px; min-width: 70px; }
        .dates-row { display: flex; justify-content: space-between; font-size: 11px; border: 1px solid #333; padding: 6px; margin-top: -1px; }
        .legend { display: flex; gap: 16px; font-size: 11px; margin-top: 16px; flex-wrap: wrap; }
        .legend span { font-weight: bold; }
        .page-break { page-break-before: always; }
        @media print { body { margin: 6mm; } }
      </style></head><body>
      <h1>Medication Administration Record (MAR) Chart</h1>
      <div class="sub">${esc(`${serviceUser.firstName} ${serviceUser.lastName}`)} · ${esc(monthLabel)} · Generated ${format(new Date(), 'dd MMM yyyy, h:mm a')}</div>
      ${tables}
      <div class="legend">
        <div><span>Initials</span> = Given</div>
        <div><span>R</span> = Refused</div>
        <div><span>M</span> = Missed</div>
        <div><span>N</span> = Not needed</div>
        <div><span>S</span> = Self-administered</div>
      </div>
      </body></html>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Please allow pop-ups to export the PDF.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold">MAR Chart — {serviceUser.firstName} {serviceUser.lastName}</h2>
            <p className="text-xs text-gray-500">Medication Administration Record · carer initials as signature</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="input" />
            <button className="btn-primary btn" onClick={exportPdf} disabled={charts.length === 0}>Export PDF</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {charts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No active medications for this client</p>
          ) : (
            charts.map(({ med, times }) => (
              <div key={med.id} className="overflow-x-auto">
                <h3 className="font-semibold text-gray-900 mb-1">
                  {med.name}{med.dose ? ` · ${med.dose}` : ''}{med.route ? ` · ${med.route}` : ''}
                </h3>
                {med.instructions && <p className="text-xs text-gray-500 mb-2">{med.instructions}</p>}
                <table className="border-collapse text-xs">
                  <thead>
                    <tr>
                      <th className="border border-gray-300 px-2 py-1.5 bg-gray-50 text-left whitespace-nowrap">TIME</th>
                      {days.map((d) => (
                        <th key={d} className="border border-gray-300 px-1.5 py-1.5 bg-gray-50 w-8">{d}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {times.length === 0 ? (
                      <tr>
                        <td className="border border-gray-300 px-2 py-1.5 font-medium">PRN</td>
                        {days.map((d) => <td key={d} className="border border-gray-300" />)}
                      </tr>
                    ) : (
                      times.map((t) => (
                        <tr key={t}>
                          <td className="border border-gray-300 px-2 py-1.5 font-medium whitespace-nowrap">{formatTime12h(t)}</td>
                          {days.map((d) => {
                            const rec = recordFor(med.id, d, t);
                            return (
                              <td
                                key={d}
                                className="border border-gray-300 text-center font-bold"
                                style={rec ? { color: STATUS_COLOR[rec.status] } : undefined}
                                title={rec ? `${STATUS_LABEL[rec.status]}${rec.user ? ` · ${rec.user.firstName} ${rec.user.lastName}` : ''}` : undefined}
                              >
                                {rec ? initialsFor(rec) : ''}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
                <div className="flex justify-between text-xs text-gray-500 border border-gray-300 border-t-0 px-2 py-1.5">
                  <span>Date Commenced: {med.startDate ? format(new Date(med.startDate), 'dd MMM yyyy') : '—'}</span>
                  <span>Date Discontinued: {med.endDate ? format(new Date(med.endDate), 'dd MMM yyyy') : '—'}</span>
                </div>
              </div>
            ))
          )}

          {charts.length > 0 && (
            <div className="flex gap-4 text-xs text-gray-500 flex-wrap pt-2 border-t">
              <span><strong>Initials</strong> = Given</span>
              <span><strong className="text-amber-700">R</strong> = Refused</span>
              <span><strong className="text-red-700">M</strong> = Missed</span>
              <span><strong className="text-gray-600">N</strong> = Not needed</span>
              <span><strong className="text-blue-700">S</strong> = Self-administered</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { trainingApi, TrainingImportRow, TrainingImportResult } from '../api/training';
import { usersApi } from '../api/users';
import { settingsApi } from '../api/settings';
import { resolveTrainingCourses } from '../lib/trainingCourses';
import { Training } from '../types';

type Status = 'valid' | 'due' | 'expired' | 'missing';

// Training is refreshed yearly, so a record is valid for 1 year from its date
// (unless an explicit expiry is set). "due" = within 30 days of expiry.
function expiryOf(rec: Training): Date {
  if (rec.expiresAt) return new Date(rec.expiresAt);
  const d = new Date(rec.date);
  d.setFullYear(d.getFullYear() + 1);
  return d;
}
function statusOf(rec: Training | undefined): Status {
  if (!rec) return 'missing';
  const expiry = expiryOf(rec).getTime();
  const now = Date.now();
  if (expiry < now) return 'expired';
  if (expiry < now + 30 * 24 * 60 * 60 * 1000) return 'due';
  return 'valid';
}
const CELL_CLASS: Record<Status, string> = {
  valid: 'bg-green-50 text-green-800',
  due: 'bg-amber-50 text-amber-800',
  expired: 'bg-red-50 text-red-700 font-medium',
  missing: 'text-gray-300',
};
// Excel fills (ARGB) mirroring the on-screen colours.
const CELL_FILL: Record<Status, string | null> = {
  valid: 'FFE7F6EC', due: 'FFFCF3E2', expired: 'FFFBE3E3', missing: null,
};

export default function TrainingMatrix() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);
  const [busyExport, setBusyExport] = useState(false);

  const { data: staff = [], isLoading: sLoad } = useQuery({ queryKey: ['users', 'training-matrix'], queryFn: () => usersApi.list({ active: true }) });
  const { data: records = [], isLoading: tLoad } = useQuery({ queryKey: ['training', 'all'], queryFn: () => trainingApi.list() });
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get, staleTime: 5 * 60 * 1000 });

  // Latest record per (staff, course), keyed by lowercased course name.
  const latest = useMemo(() => {
    const m = new Map<string, Map<string, Training>>();
    const sorted = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    for (const r of sorted) {
      let byCourse = m.get(r.userId);
      if (!byCourse) { byCourse = new Map(); m.set(r.userId, byCourse); }
      const k = r.course.trim().toLowerCase();
      if (!byCourse.has(k)) byCourse.set(k, r);
    }
    return m;
  }, [records]);

  // Columns = catalogue courses, then any course found in records not already listed.
  const courses = useMemo(() => {
    const cat = resolveTrainingCourses(settings?.trainingCourses);
    const seen = new Set(cat.map((c) => c.toLowerCase()));
    const extra: string[] = [];
    for (const r of records) { const k = r.course.trim().toLowerCase(); if (!seen.has(k)) { seen.add(k); extra.push(r.course.trim()); } }
    return [...cat, ...extra];
  }, [settings, records]);

  const term = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = staff.filter((u) => u.role !== 'FAMILY_MEMBER' && (!term || `${u.firstName} ${u.lastName}`.toLowerCase().includes(term)));
    return [...list].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, undefined, { sensitivity: 'base' }));
  }, [staff, term]);

  // Overall counts across all staff × courses.
  const counts = useMemo(() => {
    let expired = 0, due = 0, missing = 0;
    for (const u of staff.filter((s) => s.role !== 'FAMILY_MEMBER')) {
      const byCourse = latest.get(u.id);
      for (const c of courses) {
        const s = statusOf(byCourse?.get(c.toLowerCase()));
        if (s === 'expired') expired++; else if (s === 'due') due++; else if (s === 'missing') missing++;
      }
    }
    return { expired, due, missing };
  }, [staff, courses, latest]);

  const cellDate = (u: { id: string }, course: string) => latest.get(u.id)?.get(course.toLowerCase());

  const exportExcel = async () => {
    setBusyExport(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Training Matrix');
      const header = ws.addRow(['Staff Name', ...courses]);
      header.font = { bold: true };
      header.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }; c.alignment = { wrapText: true, vertical: 'top' }; });
      ws.getColumn(1).width = 24;
      for (let i = 2; i <= courses.length + 1; i++) ws.getColumn(i).width = 16;
      for (const u of rows) {
        const byCourse = latest.get(u.id);
        const row = ws.addRow([`${u.firstName} ${u.lastName}`, ...courses.map((c) => {
          const rec = byCourse?.get(c.toLowerCase());
          return rec ? format(new Date(rec.date), 'dd/MM/yyyy') : '-';
        })]);
        courses.forEach((c, i) => {
          const fill = CELL_FILL[statusOf(byCourse?.get(c.toLowerCase()))];
          if (fill) row.getCell(i + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        });
      }
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Training Matrix ${format(new Date(), 'yyyy-MM-dd')}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally { setBusyExport(false); }
  };

  if (sLoad || tLoad) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: A3 landscape; margin: 8mm; } }`}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Training Matrix</h1>
          <p className="text-sm text-gray-500">
            All staff × mandatory training · valid 1 year from completion
            {counts.expired > 0 && <span className="text-red-600 font-medium"> · {counts.expired} expired</span>}
            {counts.due > 0 && <span className="text-amber-600 font-medium"> · {counts.due} due soon</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff…" className="input w-48" />
          <button className="btn-secondary btn" onClick={exportExcel} disabled={busyExport}>{busyExport ? 'Exporting…' : '⬇ Excel'}</button>
          <button className="btn-secondary btn" onClick={() => window.print()}>🖨 Print</button>
          <button className="btn-primary btn" onClick={() => setImporting(true)}>📄 Import</button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 no-print">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300" /> Valid</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Due soon</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300" /> Expired</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-300" /> Not recorded ({counts.missing})</span>
      </div>

      <div className="card p-0 overflow-x-auto review-printable">
        <table className="border-collapse text-[11px] print:text-[7px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 bg-gray-100 text-left px-3 py-2 font-semibold text-gray-700 border border-gray-300 align-bottom min-w-[8.5rem]">Staff Name</th>
              {courses.map((c) => (
                <th key={c} className="bg-gray-100 border border-gray-300 p-0 align-bottom">
                  <div className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap font-medium text-gray-600 leading-none py-2 px-1 mx-auto">{c}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={courses.length + 1} className="px-4 py-10 text-center text-gray-400 border border-gray-300">No staff match.</td></tr>}
            {rows.map((u) => {
              const byCourse = latest.get(u.id);
              return (
                <tr key={u.id} className="hover:bg-blue-50/40">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1 font-medium text-gray-900 border border-gray-300 whitespace-nowrap cursor-pointer hover:underline" onClick={() => navigate(`/users/${u.id}`)}>{u.firstName} {u.lastName}</td>
                  {courses.map((c) => {
                    const rec = byCourse?.get(c.toLowerCase());
                    const st = statusOf(rec);
                    return (
                      <td key={c} className={`px-1 py-1 text-center tabular-nums whitespace-nowrap border border-gray-300 ${CELL_CLASS[st]}`} title={`${c}${rec ? ` · expires ${format(expiryOf(rec), 'dd MMM yyyy')}` : ' · not recorded'}`}>
                        {rec ? format(new Date(rec.date), 'dd/MM/yy') : '—'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {importing && <TrainingImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}

// ---- Importer --------------------------------------------------------------

function cellText(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join('');
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}

async function parseMatrix(file: File): Promise<TrainingImportRow[]> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  // Find the header row: cell 1 mentions "staff" and several course columns follow.
  let headerRow = -1;
  const courseCols: { col: number; course: string }[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    const vals = ws.getRow(r).values as unknown[];
    const c1 = cellText(vals[1]).toLowerCase();
    const filled = (vals || []).slice(2).filter((v) => cellText(v).trim()).length;
    if (c1.includes('staff') && filled >= 4) {
      headerRow = r;
      for (let c = 2; c <= ws.columnCount; c++) { const name = cellText(vals[c]).trim(); if (name) courseCols.push({ col: c, course: name }); }
      break;
    }
  }
  if (headerRow < 0) return [];
  const out: TrainingImportRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values as unknown[];
    const name = cellText(vals[1]).trim();
    if (!name) continue;
    const coursesMap: Record<string, string> = {};
    for (const { col, course } of courseCols) {
      const d = cellText(vals[col]).trim();
      if (d && d !== '-') coursesMap[course] = d;
    }
    out.push({ name, courses: coursesMap });
  }
  return out;
}

function TrainingImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<TrainingImportRow[] | null>(null);
  const [preview, setPreview] = useState<TrainingImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const onFile = async (file: File) => {
    setError(null); setPreview(null); setDone(null); setBusy(true);
    try {
      const parsed = await parseMatrix(file);
      if (parsed.length === 0) { setError('No training matrix found — expected a header row with "Staff Names" and course columns.'); setRows(null); }
      else { setRows(parsed); setPreview(await trainingApi.import({ rows: parsed, commit: false })); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the file.'); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!rows) return;
    setBusy(true); setError(null);
    try {
      const res = await trainingApi.import({ rows, commit: true });
      setDone(res.written);
      qc.invalidateQueries({ queryKey: ['training'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">Import training matrix</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Upload your training matrix (.xlsx). Names are matched to staff on the software; anyone not found is skipped. Each course date is saved with a 1-year expiry. Nothing is written until you confirm.</p>
          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
          <button className="btn-secondary btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Reading…' : 'Choose .xlsx file'}</button>

          {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

          {preview && done === null && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="card p-3"><div className="text-xl font-bold text-green-600 tabular-nums">{preview.matchedCount}</div><div className="text-xs text-gray-500">Staff matched</div></div>
                <div className="card p-3"><div className="text-xl font-bold text-gray-700 tabular-nums">{preview.cellCount}</div><div className="text-xs text-gray-500">Course dates to save</div></div>
                <div className="card p-3"><div className="text-xl font-bold text-amber-600 tabular-nums">{preview.unmatchedCount}</div><div className="text-xs text-gray-500">Not on software (skipped)</div></div>
              </div>
              {preview.unmatched.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-600">Skipped names ({preview.unmatched.length})</summary>
                  <div className="mt-2 max-h-40 overflow-y-auto text-gray-500 text-xs space-y-0.5">{preview.unmatched.map((n) => <div key={n}>{n}</div>)}</div>
                </details>
              )}
              <button className="btn-primary btn" disabled={busy || preview.cellCount === 0} onClick={commit}>{busy ? 'Importing…' : `Import ${preview.cellCount} course dates for ${preview.matchedCount} staff`}</button>
            </div>
          )}

          {done !== null && (
            <div className="bg-green-50 text-green-800 px-3 py-3 rounded-lg text-sm space-y-2">
              <p>✓ Saved <strong>{done}</strong> training records.</p>
              <button className="btn-secondary btn" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { usersApi, DbsImportRow, DbsImportResult } from '../api/users';
import { dbsOverThreeYears } from '../lib/dbs';
import { User } from '../types';

// Company DBS register — one row per active staff member with their DBS record,
// laid out like the office "DBS Database & Risk Assessment" spreadsheet.
// Admin-only (route-guarded). Includes the spreadsheet importer.
export default function DbsRegister() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [importing, setImporting] = useState(false);

  const { data: staff = [], isLoading } = useQuery({
    queryKey: ['users', 'dbs-register'],
    queryFn: () => usersApi.list({ active: true }),
  });

  const term = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const list = staff.filter((u) => u.role !== 'FAMILY_MEMBER');
    const filtered = term
      ? list.filter((u) => `${u.firstName} ${u.lastName} ${u.dbsCertificateNo || ''}`.toLowerCase().includes(term))
      : list;
    return [...filtered].sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, undefined, { sensitivity: 'base' }));
  }, [staff, term]);

  const withDbs = staff.filter((u) => u.dbsCertificateNo).length;
  const overdue = staff.filter((u) => dbsOverThreeYears(u.dbsDateOfIssue)).length;

  const fmt = (v?: string | null) => (v ? format(new Date(v), 'dd MMM yyyy') : '—');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">DBS Register</h1>
          <p className="text-sm text-gray-500">
            {withDbs} of {staff.length} active staff have a DBS record
            {overdue > 0 && <span className="text-red-600 font-medium"> · {overdue} over 3 years (renew)</span>}
            {' '}· administrator only
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or certificate…" className="input w-64" />
          <button className="btn-primary btn" onClick={() => setImporting(true)}>📄 Import from spreadsheet</button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-medium text-gray-600">Position Applied</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">DBS Certificate No.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date of Issue</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Risk</th>
                <th className="hidden xl:table-cell text-left px-4 py-3 font-medium text-gray-600">Issued By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400">{term ? 'No staff match your search.' : 'No active staff.'}</td></tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/users/${u.id}`)}>
                  <td className="px-4 py-3 font-medium text-gray-900">{u.firstName} {u.lastName}</td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-600">{u.dbsPositionApplied || '—'}</td>
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{u.dbsCertificateNo || <span className="badge-yellow badge">No DBS record</span>}</td>
                  <td className="px-4 py-3 text-gray-600 tabular-nums">
                    {u.dbsDateOfIssue ? (
                      <span className="inline-flex items-center gap-1.5">
                        {fmt(u.dbsDateOfIssue)}
                        {dbsOverThreeYears(u.dbsDateOfIssue) && <span className="badge-red badge whitespace-nowrap">⚠ Over 3 years</span>}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3"><RiskBadge level={u.dbsRiskLevel} /></td>
                  <td className="hidden xl:table-cell px-4 py-3 text-gray-600">{u.dbsIssuedBy || '—'}</td>
                  <td className="px-4 py-3 text-right"><span className="text-xs text-blue-600">Open</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {importing && <DbsImportModal onClose={() => setImporting(false)} />}
    </div>
  );
}

function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return <span className="text-gray-300">—</span>;
  const l = level.toLowerCase();
  const cls = l === 'high' ? 'badge-red' : l === 'medium' ? 'badge-yellow' : 'badge-green';
  return <span className={`${cls} badge`}>{level}</span>;
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

function matchCol(header: string): keyof DbsImportRow | null {
  const h = header.trim().toLowerCase();
  if (h === 'name') return 'name';
  if (h.includes('position')) return 'positionApplied';
  if (h.includes('certificate')) return 'certificateNo';
  if (h.includes('date of issue')) return 'dateOfIssue';
  if (h.includes('appointing')) return 'appointingManager';
  if (h.includes('disclosed') || h.includes('was offence')) return 'offenceDisclosed';
  if (h.includes('offence date')) return 'offenceDate';
  if (h.includes('risk') || h.includes('harm')) return 'riskLevel';
  if (h.includes('notes')) return 'notes';
  if (h.includes('issued by')) return 'issuedBy';
  return null;
}

async function parseWorkbook(file: File): Promise<DbsImportRow[]> {
  // Lazy-load exceljs so it isn't in the main bundle (only needed on import).
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: DbsImportRow[] = [];
  wb.eachSheet((ws) => {
    // Find the header row (contains "Name" and a certificate column) — the
    // Active sheet has a 2-row title banner above it, the Old sheet doesn't.
    let headerRow = -1;
    const col: Partial<Record<keyof DbsImportRow, number>> = {};
    for (let r = 1; r <= Math.min(ws.rowCount, 12); r++) {
      const vals = ws.getRow(r).values as unknown[];
      const texts = vals.map((c) => cellText(c));
      const hasName = texts.some((t) => t.trim().toLowerCase() === 'name');
      const hasCert = texts.some((t) => t.toLowerCase().includes('certificate'));
      if (hasName && hasCert) {
        headerRow = r;
        texts.forEach((t, i) => { const key = matchCol(t); if (key && col[key] === undefined) col[key] = i; });
        break;
      }
    }
    if (headerRow < 0 || col.name === undefined) return;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const vals = ws.getRow(r).values as unknown[];
      const get = (k: keyof DbsImportRow) => (col[k] !== undefined ? cellText(vals[col[k]!]).trim() : '');
      const name = get('name');
      if (!name) continue;
      out.push({
        name,
        positionApplied: get('positionApplied') || null,
        certificateNo: get('certificateNo') || null,
        dateOfIssue: get('dateOfIssue') || null,
        riskLevel: get('riskLevel') || null,
        issuedBy: get('issuedBy') || null,
        appointingManager: get('appointingManager') || null,
        offenceDisclosed: get('offenceDisclosed') || null,
        offenceDate: get('offenceDate') || null,
        notes: get('notes') || null,
      });
    }
  });
  return out;
}

function DbsImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DbsImportRow[] | null>(null);
  const [preview, setPreview] = useState<DbsImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const onFile = async (file: File) => {
    setError(null); setPreview(null); setDone(null); setBusy(true);
    try {
      const parsed = await parseWorkbook(file);
      if (parsed.length === 0) { setError('No DBS rows found in that file — expected a sheet with Name and DBS Certificate columns.'); setRows(null); }
      else {
        setRows(parsed);
        const res = await usersApi.importDbs({ rows: parsed, commit: false });
        setPreview(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!rows) return;
    setBusy(true); setError(null);
    try {
      const res = await usersApi.importDbs({ rows, commit: true });
      setDone(res.updated);
      qc.invalidateQueries({ queryKey: ['users'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">Import DBS records</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Upload your DBS spreadsheet (.xlsx). Names are matched to staff on the software; anyone not found is skipped. Nothing is saved until you confirm.</p>

          <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); }} />
          <button className="btn-secondary btn" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Reading…' : 'Choose .xlsx file'}</button>

          {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{error}</div>}

          {preview && done === null && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="card p-3"><div className="text-xl font-bold text-green-600 tabular-nums">{preview.matchedCount}</div><div className="text-xs text-gray-500">Will update</div></div>
                <div className="card p-3"><div className="text-xl font-bold text-amber-600 tabular-nums">{preview.unmatchedCount}</div><div className="text-xs text-gray-500">Not on software (skipped)</div></div>
                <div className="card p-3"><div className="text-xl font-bold text-gray-500 tabular-nums">{preview.ambiguousCount}</div><div className="text-xs text-gray-500">Name matches 2+ staff</div></div>
              </div>
              {preview.unmatched.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-600">Skipped names ({preview.unmatched.length})</summary>
                  <div className="mt-2 max-h-40 overflow-y-auto text-gray-500 text-xs space-y-0.5">{preview.unmatched.map((n) => <div key={n}>{n}</div>)}</div>
                </details>
              )}
              {preview.ambiguous.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-amber-700">Ambiguous names ({preview.ambiguous.length}) — fix these by name, then re-import</summary>
                  <div className="mt-2 max-h-40 overflow-y-auto text-gray-500 text-xs space-y-0.5">{preview.ambiguous.map((n) => <div key={n}>{n}</div>)}</div>
                </details>
              )}
              <button className="btn-primary btn" disabled={busy || preview.matchedCount === 0} onClick={commit}>
                {busy ? 'Importing…' : `Import ${preview.matchedCount} matched record${preview.matchedCount === 1 ? '' : 's'}`}
              </button>
            </div>
          )}

          {done !== null && (
            <div className="bg-green-50 text-green-800 px-3 py-3 rounded-lg text-sm space-y-2">
              <p>✓ Imported DBS records for <strong>{done}</strong> staff member{done === 1 ? '' : 's'}.</p>
              <button className="btn-secondary btn" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

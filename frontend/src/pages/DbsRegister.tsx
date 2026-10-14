import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { usersApi } from '../api/users';
import { dbsOverThreeYears } from '../lib/dbs';
import { User } from '../types';

// Company DBS register — one row per active staff member with their DBS record,
// laid out like the office "DBS Database & Risk Assessment" spreadsheet.
// Admin-only (route-guarded). Includes the spreadsheet importer.
export default function DbsRegister() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

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
            {' '}· restricted access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or certificate…" className="input w-64" />
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
    </div>
  );
}

function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return <span className="text-gray-300">—</span>;
  const l = level.toLowerCase();
  const cls = l === 'high' ? 'badge-red' : l === 'medium' ? 'badge-yellow' : 'badge-green';
  return <span className={`${cls} badge`}>{level}</span>;
}

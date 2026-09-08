import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { serviceUsersApi } from '../api/serviceUsers';
import { sitesApi } from '../api/sites';
import { SERVICE_USER_DOCS, docStatusFromMissing } from '../lib/serviceUserDocuments';

// Company-wide client documents matrix: one row per active client, a column per
// tracked document (✓ done / ✗ missing / — not applicable), driven by the same
// compliance endpoint the Service Users badges use. Joined with the service
// users list for name + site + careType.
export default function ClientDocuments() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);

  const { data: complianceRows = [], isLoading: loadingCompliance } = useQuery({
    queryKey: ['service-users-compliance'],
    queryFn: () => serviceUsersApi.compliance(),
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['service-users', 'documents'],
    queryFn: () => serviceUsersApi.list(),
  });
  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // One row per client returned by the compliance endpoint (active, in-care),
  // joined to their record for name/site/careType and expanded to per-doc status.
  const rows = useMemo(() => {
    return complianceRows
      .map((c) => {
        const su = userById.get(c.id);
        if (!su) return null;
        return {
          id: c.id,
          name: `${su.firstName} ${su.lastName}`,
          site: su.site,
          careType: su.careType,
          complete: c.complete,
          missingCount: c.missingCount,
          docs: docStatusFromMissing(c.missing, su.careType),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [complianceRows, userById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (filterSite && r.site?.id !== filterSite) return false;
      if (incompleteOnly && r.complete) return false;
      return true;
    });
  }, [rows, search, filterSite, incompleteOnly]);

  const totalComplete = rows.filter((r) => r.complete).length;
  const isLoading = loadingCompliance || loadingUsers;
  const hasFilters = !!(search || filterSite || incompleteOnly);

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => navigate('/service-users')} className="text-sm text-blue-600 hover:underline mb-2">← Service Users</button>
        <h1 className="text-2xl font-bold text-gray-900">Documents</h1>
        <p className="text-sm text-gray-500">
          Core care-record completeness across all clients — one row per active service user, one column per required document.
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-2xl font-bold text-gray-900">{rows.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Active clients</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-green-600">{totalComplete}</div>
          <div className="text-xs text-gray-500 mt-0.5">Files complete</div>
        </div>
        <div className="card p-4">
          <div className="text-2xl font-bold text-red-600">{rows.length - totalComplete}</div>
          <div className="text-xs text-gray-500 mt-0.5">With missing docs</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name…"
            className="input pl-9 w-full"
          />
        </div>
        <select value={filterSite} onChange={(e) => setFilterSite(e.target.value)} className="input w-auto">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input type="checkbox" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)} className="rounded border-gray-300" />
          Incomplete only
        </label>
        {hasFilters && (
          <button
            className="text-sm text-gray-500 hover:text-gray-800 px-2"
            onClick={() => { setSearch(''); setFilterSite(''); setIncompleteOnly(false); }}
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-sm text-gray-500">
          {totalComplete} of {rows.length} clients complete
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">🗂️</p>
          <p className="text-gray-600 font-medium">{hasFilters ? 'No clients match your filters' : 'No active clients to show'}</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap sticky left-0 bg-gray-50">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Site</th>
                {SERVICE_USER_DOCS.map((d) => (
                  <th key={d.key} className="px-3 py-3 font-medium text-gray-600 text-center whitespace-nowrap" title={d.label}>{d.short}</th>
                ))}
                <th className="px-3 py-3 font-medium text-gray-600 text-center whitespace-nowrap">Missing</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/service-users/${r.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap sticky left-0 bg-white">{r.name}</td>
                  <td className="px-4 py-3">
                    {r.site ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: r.site.color }}>
                        📍 {r.site.name}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  {r.docs.map((doc) => (
                    <td key={doc.key} className="px-3 py-3 text-center">
                      {!doc.applicable ? (
                        <span className="text-gray-300" title="Not applicable">—</span>
                      ) : doc.done ? (
                        <span className="text-green-600 font-semibold" title={`${doc.label}: done`}>✓</span>
                      ) : (
                        <span className="text-red-600 font-semibold" title={`${doc.label}: missing`}>✗</span>
                      )}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    {r.complete
                      ? <span className="badge-green badge">✓ Complete</span>
                      : <span className="badge-red badge">⚠ {r.missingCount}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

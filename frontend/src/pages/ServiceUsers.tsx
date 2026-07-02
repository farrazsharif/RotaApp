import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceUsersApi } from '../api/serviceUsers';
import { sitesApi } from '../api/sites';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser, ServiceUserStatus } from '../types';
import { differenceInYears } from 'date-fns';
import HospitalIcon from '../components/HospitalIcon';
import Avatar from '../components/Avatar';

const STATUS_META: Record<ServiceUserStatus, { label: string; icon: string; className: string }> = {
  ACTIVE: { label: 'Active', icon: '🟢', className: 'bg-green-100 text-green-700' },
  ON_HOLD: { label: 'On Hold', icon: '⏸️', className: 'bg-gray-200 text-gray-700' },
  HOSPITALISED: { label: 'Hospitalised', icon: '', className: 'bg-amber-100 text-amber-700' },
  DISCHARGED: { label: 'Discharged', icon: '↩️', className: 'bg-blue-100 text-blue-700' },
  DECEASED: { label: 'Passed Away', icon: '⚪', className: 'bg-slate-300 text-slate-800' },
};

const SITE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#84cc16', '#6366f1',
  '#14b8a6', '#a855f7',
  '#f43f5e', '#0ea5e9', '#22c55e', '#eab308', '#9333ea', '#0d9488',
  '#b91c1c', '#15803d', '#1e40af', '#ca8a04', '#64748b', '#78716c',
];

const durationLabel = (m: number) =>
  m >= 60 ? `${m / 60} hr${m > 60 ? 's' : ''}${m % 60 ? ` ${m % 60}m` : ''}` : `${m} mins`;

export default function ServiceUsers() {
  const { isManager } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filterSite, setFilterSite] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showSites, setShowSites] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [siteName, setSiteName] = useState('');
  const [siteColor, setSiteColor] = useState(SITE_COLORS[0]);
  const [editSiteId, setEditSiteId] = useState<string | null>(null);

  const { data: serviceUsers = [], isLoading } = useQuery({
    queryKey: ['service-users', search, filterSite, filterStatus],
    queryFn: () => serviceUsersApi.list({
      search: search || undefined,
      siteId: filterSite || undefined,
      status: (filterStatus || undefined) as ServiceUserStatus | undefined,
    }),
  });

  const { data: sites = [] } = useQuery({ queryKey: ['sites'], queryFn: sitesApi.list });

  const deleteMut = useMutation({
    mutationFn: (id: string) => serviceUsersApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-users'] }); setConfirmDelete(null); },
  });

  const refreshSites = () => {
    qc.invalidateQueries({ queryKey: ['sites'] });
    qc.invalidateQueries({ queryKey: ['service-users'] });
  };
  const resetSiteForm = () => { setEditSiteId(null); setSiteName(''); setSiteColor(SITE_COLORS[0]); };
  const createSiteMut = useMutation({
    mutationFn: () => sitesApi.create({ name: siteName.trim(), color: siteColor }),
    onSuccess: () => { refreshSites(); resetSiteForm(); },
  });
  const updateSiteMut = useMutation({
    mutationFn: () => sitesApi.update(editSiteId!, { name: siteName.trim(), color: siteColor }),
    onSuccess: () => { refreshSites(); resetSiteForm(); },
  });
  const deleteSiteMut = useMutation({
    mutationFn: (id: string) => sitesApi.delete(id),
    onSuccess: () => { refreshSites(); resetSiteForm(); },
  });
  const siteError = (createSiteMut.error || updateSiteMut.error) as { response?: { data?: { error?: string } } } | null;

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  const hasFilters = !!(search || filterSite || filterStatus);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Service Users</h1>
          <p className="text-sm text-gray-500">
            {serviceUsers.length} {serviceUsers.length === 1 ? 'person' : 'people'}{hasFilters ? ' matching filters' : ' in your care'}
          </p>
        </div>
        {isManager && (
          <div className="flex gap-2">
            <button className="btn-secondary btn" onClick={() => setShowSites(true)}>Manage Sites</button>
            <button className="btn-primary btn" onClick={() => navigate('/service-users/new')}>+ Add Service User</button>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or postcode…"
            className="input pl-9 w-full"
          />
        </div>
        <select value={filterSite} onChange={(e) => setFilterSite(e.target.value)} className="input w-auto">
          <option value="">All sites</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input w-auto">
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>{value === 'HOSPITALISED' ? '🔴 H' : meta.icon} {meta.label}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            className="text-sm text-gray-500 hover:text-gray-800 px-2"
            onClick={() => { setSearch(''); setFilterSite(''); setFilterStatus(''); }}
          >
            Clear
          </button>
        )}
      </div>

      {serviceUsers.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">🧑‍🦽</p>
          <p className="text-gray-600 font-medium">{hasFilters ? 'No service users match your search' : 'No service users yet'}</p>
          {isManager && !hasFilters && (
            <button className="btn-primary btn mt-4" onClick={() => navigate('/service-users/new')}>+ Add your first service user</button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {serviceUsers.map((su) => {
            const meta = STATUS_META[su.status] || STATUS_META.ACTIVE;
            return (
              <div
                key={su.id}
                onClick={() => navigate(`/service-users/${su.id}`)}
                className="card p-0 overflow-hidden cursor-pointer hover:shadow-lg hover:border-blue-300 hover:-translate-y-0.5 transition-all flex flex-col"
              >
                {/* Card header */}
                <div className="flex items-start gap-3 p-4 pb-3">
                  <Avatar photo={su.photo} firstName={su.firstName} lastName={su.lastName} size="md" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 truncate">{su.firstName} {su.lastName}</h3>
                    <p className="text-xs text-gray-500 truncate">
                      {su.dateOfBirth && `${differenceInYears(new Date(), new Date(su.dateOfBirth))} yrs`}
                      {su.nhsNumber && ` · NHS ${su.nhsNumber}`}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${meta.className}`}>
                    {su.status === 'HOSPITALISED' ? <HospitalIcon /> : meta.icon} {meta.label}
                  </span>
                </div>

                {/* Body */}
                <div className="px-4 pb-3 space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {su.site && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: su.site.color }}>
                        📍 {su.site.name}
                      </span>
                    )}
                    <span className="badge-blue badge">{durationLabel(su.visitDuration)} visit</span>
                  </div>

                  {(su.address || su.postcode) && (
                    <p className="text-sm text-gray-600 flex items-start gap-1.5">
                      <span className="text-gray-400">📍</span>
                      <span className="min-w-0">{[su.address, su.postcode].filter(Boolean).join(', ')}</span>
                    </p>
                  )}
                  {su.phone && (
                    <p className="text-sm text-gray-600 flex items-center gap-1.5">
                      <span className="text-gray-400">📞</span> {su.phone}
                    </p>
                  )}

                  {(su.needsMedication || su.needsMobility || su.needsPersonalCare) && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {su.needsMedication && <span className="badge-red badge">Medication</span>}
                      {su.needsMobility && <span className="badge-yellow badge">Mobility</span>}
                      {su.needsPersonalCare && <span className="badge-purple badge">Personal Care</span>}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2.5 border-t bg-gray-50">
                  <span className="text-xs font-medium text-blue-600">View full record →</span>
                  {isManager && (
                    confirmDelete === su.id ? (
                      <span className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <span className="text-xs text-red-700">Delete?</span>
                        <button className="btn-danger btn btn-sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(su.id)}>Yes</button>
                        <button className="btn-secondary btn btn-sm" onClick={() => setConfirmDelete(null)}>No</button>
                      </span>
                    ) : (
                      <button
                        className="text-xs text-red-600 hover:underline"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(su.id); }}
                      >
                        Delete
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showSites && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold">Manage Remote Sites</h2>
              <button onClick={() => { setShowSites(false); resetSiteForm(); }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="p-6 space-y-5">
              {sites.length > 0 && (
                <div className="space-y-2">
                  {sites.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg border">
                      <span className="h-5 w-5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className="flex-1 text-sm font-medium">{s.name}</span>
                      <span className="text-xs text-gray-400">{s._count?.serviceUsers ?? 0} patients</span>
                      <button
                        className="text-blue-600 text-sm hover:underline"
                        onClick={() => { setEditSiteId(s.id); setSiteName(s.name); setSiteColor(s.color); }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 text-sm hover:underline"
                        onClick={() => deleteSiteMut.mutate(s.id)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">{editSiteId ? 'Edit Site' : 'Add Site'}</h3>
                {siteError && (
                  <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                    {siteError.response?.data?.error || 'An error occurred'}
                  </div>
                )}
                <div>
                  <label className="label">Site Name</label>
                  <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. North London" className="input" />
                </div>
                <div>
                  <label className="label">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {SITE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setSiteColor(c)}
                        className={`h-8 w-8 rounded-full border-2 transition-transform ${siteColor === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  {editSiteId && <button className="btn-secondary btn btn-sm" onClick={resetSiteForm}>Cancel Edit</button>}
                  <button
                    className="btn-primary btn"
                    disabled={!siteName.trim() || createSiteMut.isPending || updateSiteMut.isPending}
                    onClick={() => editSiteId ? updateSiteMut.mutate() : createSiteMut.mutate()}
                  >
                    {editSiteId ? 'Save Site' : 'Add Site'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

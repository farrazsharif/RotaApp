import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { medicationsApi } from '../api/medications';
import { serviceUsersApi } from '../api/serviceUsers';
import { useAuth } from '../contexts/AuthContext';
import { MedAdministration, MedStatus, ServiceUser } from '../types';
import { format, startOfWeek, endOfWeek, subWeeks, subDays } from 'date-fns';
import MarChartModal from '../components/MarChartModal';
import EmarModal from '../components/EmarModal';
import RecordMedModal from '../components/RecordMedModal';

const STATUS_LABEL: Record<MedStatus, string> = {
  GIVEN: 'Administered', REFUSED: 'Refused', MISSED: 'Absent', NOT_NEEDED: 'Not Required', SELF_ADMIN: 'Self-admin', CANCELLED: 'Cancelled',
};
const STATUS_BADGE: Record<MedStatus, string> = {
  GIVEN: 'badge-green', REFUSED: 'badge-yellow', MISSED: 'badge-red', NOT_NEEDED: 'badge-gray', SELF_ADMIN: 'badge-blue', CANCELLED: 'badge-gray',
};

export default function Emar() {
  const { isManager } = useAuth();
  const [search, setSearch] = useState('');
  const [marChartFor, setMarChartFor] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [addMedFor, setAddMedFor] = useState<ServiceUser | null>(null);
  const [editRec, setEditRec] = useState<MedAdministration | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MedStatus>('ALL');
  const [range, setRange] = useState<'recent' | 'today' | 'week' | 'lastweek' | 'last30'>('recent');

  // Translate the range preset into start/end dates (or a recent-N fetch).
  const rangeParams = (() => {
    const today = new Date();
    const fmt = (d: Date) => format(d, 'yyyy-MM-dd');
    switch (range) {
      case 'today': return { startDate: fmt(today), endDate: fmt(today) };
      case 'week': return { startDate: fmt(startOfWeek(today, { weekStartsOn: 1 })), endDate: fmt(endOfWeek(today, { weekStartsOn: 1 })) };
      case 'lastweek': { const w = subWeeks(today, 1); return { startDate: fmt(startOfWeek(w, { weekStartsOn: 1 })), endDate: fmt(endOfWeek(w, { weekStartsOn: 1 })) }; }
      case 'last30': return { startDate: fmt(subDays(today, 29)), endDate: fmt(today) };
      default: return { recent: 200 };
    }
  })();

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['med-admin', range, statusFilter],
    queryFn: () => medicationsApi.queryAdministrations({
      ...rangeParams,
      status: statusFilter === 'ALL' ? undefined : statusFilter,
    }),
  });

  const { data: serviceUsers = [] } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
    enabled: pickerOpen,
  });

  const pickerTerm = pickerSearch.trim().toLowerCase();
  const filteredServiceUsers = serviceUsers.filter(
    (su) => !pickerTerm || `${su.firstName} ${su.lastName}`.toLowerCase().includes(pickerTerm),
  );

  const term = search.trim().toLowerCase();
  const filtered = records.filter((r) => {
    if (!term) return true;
    const hay = [
      r.serviceUser ? `${r.serviceUser.firstName} ${r.serviceUser.lastName}` : '',
      r.medication?.name || '',
      r.user ? `${r.user.firstName} ${r.user.lastName}` : '',
    ].join(' ').toLowerCase();
    return hay.includes(term);
  });

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">eMAR</h1>
          <p className="text-sm text-gray-500">Medication administered by carers · click a client's name to view their MAR Chart</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, medication or carer…"
            className="input w-72"
          />
          {isManager && (
            <button className="btn-primary btn" onClick={() => { setPickerOpen(true); setPickerSearch(''); }}>
              + Add Medication
            </button>
          )}
        </div>
      </div>

      {/* Filters: status (e.g. Absent/missed) across a date range */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {([['recent', 'Recent'], ['today', 'Today'], ['week', 'This week'], ['lastweek', 'Last week'], ['last30', 'Last 30 days']] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setRange(v)}
              className={`px-3 py-1.5 ${range === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'} border-r border-gray-200 last:border-r-0`}
            >
              {label}
            </button>
          ))}
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | MedStatus)} className="input w-44">
          <option value="ALL">All statuses</option>
          <option value="MISSED">Absent (missed)</option>
          <option value="REFUSED">Refused</option>
          <option value="NOT_NEEDED">Not Required</option>
          <option value="GIVEN">Administered</option>
          <option value="SELF_ADMIN">Self-administered</option>
        </select>
        <span className="text-sm text-gray-500">{filtered.length} record{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          {statusFilter === 'ALL' ? 'No medication records for this period' : `No ${STATUS_LABEL[statusFilter as MedStatus].toLowerCase()} records for this period`}
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Recorded At</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Medication</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
                {isManager && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-600">{format(new Date(r.scheduledFor), 'dd MMM, h:mm a')}</td>
                  <td className="px-4 py-3 text-gray-600">{format(new Date(r.recordedAt), 'dd MMM, h:mm a')}</td>
                  <td className="px-4 py-3 font-medium">
                    {r.serviceUser ? (
                      <button
                        className="text-blue-600 hover:underline text-left"
                        title="View MAR Chart"
                        onClick={() => setMarChartFor(r.serviceUser!)}
                      >
                        {r.serviceUser.firstName} {r.serviceUser.lastName}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.medication?.name}{r.medication?.dose ? ` · ${r.medication.dose}` : ''}
                  </td>
                  <td className="px-4 py-3"><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                  <td className="px-4 py-3 text-gray-600">{r.user ? `${r.user.firstName} ${r.user.lastName}` : '—'}</td>
                  {isManager && (
                    <td className="px-4 py-3 text-right">
                      <button className="text-blue-600 hover:underline" onClick={() => setEditRec(r)}>Edit</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editRec && editRec.serviceUser && editRec.medication && (
        <RecordMedModal
          serviceUser={editRec.serviceUser}
          medication={editRec.medication}
          scheduledFor={editRec.scheduledFor}
          existing={editRec}
          onClose={() => setEditRec(null)}
        />
      )}

      {marChartFor && <MarChartModal serviceUser={marChartFor} onClose={() => setMarChartFor(null)} />}
      {addMedFor && <EmarModal serviceUser={addMedFor} onClose={() => setAddMedFor(null)} defaultShowAdd />}

      {pickerOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-gray-900">Select Client</h3>
              <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-4 border-b">
              <input
                autoFocus
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search clients…"
                className="input w-full"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredServiceUsers.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No clients found</p>
              ) : (
                filteredServiceUsers.map((su) => (
                  <button
                    key={su.id}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100"
                    onClick={() => { setAddMedFor(su); setPickerOpen(false); }}
                  >
                    {su.firstName} {su.lastName}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { medicationsApi } from '../api/medications';
import { serviceUsersApi } from '../api/serviceUsers';
import { useAuth } from '../contexts/AuthContext';
import { MedStatus, ServiceUser } from '../types';
import { format } from 'date-fns';
import MarChartModal from '../components/MarChartModal';
import EmarModal from '../components/EmarModal';

const STATUS_LABEL: Record<MedStatus, string> = {
  GIVEN: 'Given', REFUSED: 'Refused', MISSED: 'Missed', NOT_NEEDED: 'Not needed', SELF_ADMIN: 'Self-admin',
};
const STATUS_BADGE: Record<MedStatus, string> = {
  GIVEN: 'badge-green', REFUSED: 'badge-yellow', MISSED: 'badge-red', NOT_NEEDED: 'badge-gray', SELF_ADMIN: 'badge-blue',
};

export default function Emar() {
  const { isManager } = useAuth();
  const [search, setSearch] = useState('');
  const [marChartFor, setMarChartFor] = useState<{ id: string; firstName: string; lastName: string } | null>(null);
  const [addMedFor, setAddMedFor] = useState<ServiceUser | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['med-admin', 'recent'],
    queryFn: () => medicationsApi.recentAdministrations(200),
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

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No medication records yet</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Recorded At</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Medication</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

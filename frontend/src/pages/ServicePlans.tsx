import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { serviceUsersApi } from '../api/serviceUsers';
import { ServiceUser } from '../types';
import PersonalServicePlanModal from '../components/PersonalServicePlanModal';

export default function ServicePlans() {
  const [search, setSearch] = useState('');
  const [openFor, setOpenFor] = useState<ServiceUser | null>(null);

  const { data: serviceUsers = [], isLoading } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });

  const term = search.trim().toLowerCase();
  const filtered = serviceUsers.filter((su) => !term || `${su.firstName} ${su.lastName}`.toLowerCase().includes(term));

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personal Service Plans</h1>
          <p className="text-sm text-gray-500">Click a client to view or edit their personal service plan</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="input w-72"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">{term ? 'No matching clients' : 'No clients yet'}</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Client</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Site</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((su) => (
                <tr key={su.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{su.firstName} {su.lastName}</td>
                  <td className="px-4 py-3 text-gray-500">{su.site?.name || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="btn-secondary btn btn-sm" onClick={() => setOpenFor(su)}>Open Service Plan</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openFor && <PersonalServicePlanModal serviceUser={openFor} onClose={() => setOpenFor(null)} />}
    </div>
  );
}

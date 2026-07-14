import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { serviceUsersApi } from '../api/serviceUsers';
import { servicePlansApi } from '../api/servicePlans';
import { printServicePlan } from '../lib/servicePlanPrint';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser } from '../types';
import PersonalServicePlanModal from '../components/PersonalServicePlanModal';

export default function ServicePlans() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openFor, setOpenFor] = useState<ServiceUser | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  const { data: serviceUsers = [], isLoading } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });

  const { data: planSummary = [] } = useQuery({
    queryKey: ['service-plans', 'summary'],
    queryFn: () => servicePlansApi.list(),
  });
  const planMap = new Map(planSummary.map((p) => [p.serviceUserId, p.updatedAt]));

  const deleteMut = useMutation({
    mutationFn: (serviceUserId: string) => servicePlansApi.remove(serviceUserId),
    onSuccess: (_d, serviceUserId) => {
      qc.invalidateQueries({ queryKey: ['service-plans', 'summary'] });
      qc.invalidateQueries({ queryKey: ['service-plan', serviceUserId] });
    },
  });

  // Print straight from the row: fetch the saved plan, then open the print view.
  async function handlePrint(su: ServiceUser) {
    setPrinting(su.id);
    try {
      const plan = await servicePlansApi.get(su.id);
      let values: Record<string, unknown> = {};
      if (plan?.data) { try { values = JSON.parse(plan.data); } catch { values = {}; } }
      printServicePlan(su, values);
    } finally {
      setPrinting(null);
    }
  }

  function handleDelete(su: ServiceUser) {
    if (!window.confirm(`Delete the service plan for ${su.firstName} ${su.lastName}? This clears all saved answers but keeps the client.`)) return;
    deleteMut.mutate(su.id);
  }

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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Plan</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((su) => {
                const updatedAt = planMap.get(su.id);
                const hasPlan = updatedAt !== undefined;
                return (
                  <tr key={su.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{su.firstName} {su.lastName}</td>
                    <td className="px-4 py-3 text-gray-500">{su.site?.name || '—'}</td>
                    <td className="px-4 py-3">
                      {hasPlan ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-0.5 text-xs font-medium">
                          Updated {format(new Date(updatedAt!), 'dd MMM yyyy')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 text-gray-500 px-2.5 py-0.5 text-xs font-medium">
                          Not started
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {!hasPlan ? (
                          isManager ? (
                            <button
                              className="btn btn-sm bg-green-600 text-white hover:bg-green-700"
                              onClick={() => setOpenFor(su)}
                            >
                              + Create Service Plan
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">No plan yet</span>
                          )
                        ) : (
                          <>
                            <button className="btn-secondary btn btn-sm" onClick={() => setOpenFor(su)}>Open</button>
                            <button
                              className="btn-secondary btn btn-sm"
                              disabled={printing === su.id}
                              onClick={() => handlePrint(su)}
                            >
                              {printing === su.id ? '…' : '🖨 Print'}
                            </button>
                            {isManager && (
                              <button
                                className="btn btn-sm border border-red-200 text-red-600 hover:bg-red-50"
                                disabled={deleteMut.isPending}
                                onClick={() => handleDelete(su)}
                                title="Delete service plan"
                              >
                                🗑
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openFor && <PersonalServicePlanModal serviceUser={openFor} onClose={() => setOpenFor(null)} />}
    </div>
  );
}

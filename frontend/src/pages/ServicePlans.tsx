import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { serviceUsersApi } from '../api/serviceUsers';
import { servicePlansApi } from '../api/servicePlans';
import { servicePlanTemplateApi } from '../api/servicePlanTemplate';
import { defaultTemplateSections } from '../lib/servicePlanSchema';
import { printServicePlan } from '../lib/servicePlanPrint';
import { useAuth } from '../contexts/AuthContext';
import { ServiceUser } from '../types';
import PersonalServicePlanModal from '../components/PersonalServicePlanModal';

export default function ServicePlans() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [openFor, setOpenFor] = useState<ServiceUser | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: serviceUsers = [], isLoading } = useQuery({
    queryKey: ['service-users', 'active'],
    queryFn: () => serviceUsersApi.list({ active: true }),
  });

  const { data: planSummary = [] } = useQuery({
    queryKey: ['service-plans', 'summary'],
    queryFn: () => servicePlansApi.list(),
  });
  const planMap = new Map(planSummary.map((p) => [p.serviceUserId, p]));

  const deleteMut = useMutation({
    mutationFn: (serviceUserId: string) => servicePlansApi.remove(serviceUserId),
    onSuccess: (_d, serviceUserId) => {
      qc.invalidateQueries({ queryKey: ['service-plans', 'summary'] });
      qc.invalidateQueries({ queryKey: ['service-plan', serviceUserId] });
    },
  });

  // Open the saved plan as a readable view (autoPrint) or send straight to print.
  async function openPlanView(su: ServiceUser, autoPrint: boolean) {
    setBusy(su.id);
    try {
      const [plan, tpl] = await Promise.all([servicePlansApi.get(su.id), servicePlanTemplateApi.get().catch(() => null)]);
      let values: Record<string, unknown> = {};
      if (plan?.data) { try { values = JSON.parse(plan.data); } catch { values = {}; } }
      const sections = tpl?.sections?.length ? tpl.sections : defaultTemplateSections();
      printServicePlan(su, values, { autoPrint, createdAt: plan?.createdAt, updatedAt: plan?.updatedAt, sections });
    } finally {
      setBusy(null);
    }
  }

  function handleDelete(su: ServiceUser) {
    if (!window.confirm(`Delete the service plan for ${su.firstName} ${su.lastName}? This clears all saved answers but keeps the client.`)) return;
    deleteMut.mutate(su.id);
  }

  const term = search.trim().toLowerCase();
  const filtered = serviceUsers.filter((su) => !term || `${su.firstName} ${su.lastName}`.toLowerCase().includes(term));

  const totalClients = serviceUsers.length;
  const withPlan = serviceUsers.filter((su) => planMap.has(su.id)).length;
  const missingPlan = totalClients - withPlan;

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personal Service Plans</h1>
          <p className="text-sm text-gray-500">Open a client to view their plan, or edit it</p>
          <p className="text-sm mt-1">
            <span className="font-semibold text-green-700">{withPlan}</span>
            <span className="text-gray-500"> of {totalClients} clients have a plan</span>
            {missingPlan > 0 && <span className="text-gray-400"> · {missingPlan} not started</span>}
          </p>
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
                const plan = planMap.get(su.id);
                const hasPlan = plan !== undefined;
                return (
                  <tr key={su.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{su.firstName} {su.lastName}</td>
                    <td className="px-4 py-3 text-gray-500">{su.site?.name || '—'}</td>
                    <td className="px-4 py-3">
                      {hasPlan ? (
                        <div className="text-xs leading-5">
                          <div className="text-gray-500">Created {format(new Date(plan!.createdAt), 'dd MMM yyyy')}</div>
                          <div className="text-green-700 font-medium">Updated {format(new Date(plan!.updatedAt), 'dd MMM yyyy, h:mm a')}</div>
                        </div>
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
                            <button
                              className="btn-secondary btn btn-sm"
                              disabled={busy === su.id}
                              onClick={() => openPlanView(su, false)}
                            >
                              {busy === su.id ? '…' : 'Open'}
                            </button>
                            {isManager && (
                              <button className="btn-secondary btn btn-sm" onClick={() => setOpenFor(su)}>Edit</button>
                            )}
                            <button
                              className="btn-secondary btn btn-sm"
                              disabled={busy === su.id}
                              onClick={() => openPlanView(su, true)}
                            >
                              🖨 Print
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

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { servicePlanVersionsApi } from '../api/servicePlanVersions';
import { printServicePlan } from '../lib/servicePlanPrint';
import { ServiceUser } from '../types';

// Lists a client's immutable signed versions (the CQC audit trail). Each opens
// as a read-only / printable snapshot rendered with the exact questions and
// answers captured at sign-off. Reused by the plan modal and the list page.
export default function ServicePlanHistory({ serviceUser, compact }: { serviceUser: ServiceUser; compact?: boolean }) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['service-plan-versions', serviceUser.id],
    queryFn: () => servicePlanVersionsApi.list(serviceUser.id),
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function open(id: string, autoPrint: boolean) {
    setBusy(id);
    try {
      const v = await servicePlanVersionsApi.get(id);
      printServicePlan(serviceUser, v.data, {
        autoPrint,
        sections: v.sections,
        createdAt: v.createdAt,
        updatedAt: v.createdAt,
        signed: { label: v.label, signedByName: v.signedByName, signedOn: v.createdAt, signedBy: v.createdByName },
      });
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <p className="text-sm text-gray-400 py-4">Loading history…</p>;
  if (versions.length === 0) {
    return <p className={`text-sm text-gray-400 ${compact ? 'py-2' : 'py-6 text-center'}`}>No signed versions yet. Finalise a plan to create the first audit record.</p>;
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div key={v.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">
              {v.label || 'Signed version'}
              {v.signedByName && <span className="font-normal text-gray-500"> · signatory {v.signedByName}</span>}
            </p>
            <p className="text-xs text-gray-400">{format(new Date(v.createdAt), 'dd MMM yyyy, h:mm a')} · finalised by {v.createdByName}</p>
          </div>
          <button className="text-xs text-blue-600 hover:underline shrink-0" disabled={busy === v.id} onClick={() => open(v.id, false)}>View</button>
          <button className="text-xs text-blue-600 hover:underline shrink-0" disabled={busy === v.id} onClick={() => open(v.id, true)}>Print</button>
        </div>
      ))}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { riskAssessmentVersionsApi } from '../api/riskAssessmentVersions';

// Lists a client's completed reviews for one assessment type. Each opens as a
// read-only / printable snapshot. How a snapshot is rendered differs per type
// (each modal prints differently), so the parent supplies `onOpen(data,
// autoPrint)` — it receives the frozen snapshot values and whether to auto-print.
export default function RiskAssessmentHistory({
  serviceUserId,
  type,
  onOpen,
}: {
  serviceUserId: string;
  type: string;
  onOpen: (data: Record<string, unknown>, autoPrint: boolean) => void;
}) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['risk-assessment-versions', serviceUserId, type],
    queryFn: () => riskAssessmentVersionsApi.list(serviceUserId, type),
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function open(id: string, autoPrint: boolean) {
    setBusy(id);
    try {
      const v = await riskAssessmentVersionsApi.get(id);
      onOpen(v.data, autoPrint);
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return <p className="text-sm text-gray-400 py-4">Loading reviews…</p>;
  if (versions.length === 0) {
    return <p className="text-sm text-gray-400 py-2">No previous reviews yet. Complete a review to archive the first dated snapshot.</p>;
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div key={v.id} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">
              {v.label || 'Review'}
              {v.reviewDate && <span className="font-normal text-gray-500"> · next review {format(new Date(v.reviewDate), 'dd MMM yyyy')}</span>}
            </p>
            <p className="text-xs text-gray-400">{format(new Date(v.createdAt), 'dd MMM yyyy, h:mm a')} · completed by {v.createdByName}</p>
          </div>
          <button className="text-xs text-blue-600 hover:underline shrink-0" disabled={busy === v.id} onClick={() => open(v.id, false)}>View</button>
          <button className="text-xs text-blue-600 hover:underline shrink-0" disabled={busy === v.id} onClick={() => open(v.id, true)}>Print</button>
        </div>
      ))}
    </div>
  );
}

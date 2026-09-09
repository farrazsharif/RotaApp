import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { carePlanVersionsApi } from '../api/carePlanVersions';
import { printCarePlan, CarePlanSchedule } from '../lib/carePlanPrint';
import { ServiceUser } from '../types';

// Turn a frozen snapshot (schedule / extraCalls stored as JSON strings) into the
// shape printCarePlan expects.
function snapshotToPrintData(data: Record<string, unknown>) {
  let schedule: CarePlanSchedule = {};
  try {
    const raw = data.schedule;
    schedule = typeof raw === 'string' ? JSON.parse(raw || '{}') : ((raw as CarePlanSchedule) || {});
  } catch { schedule = {}; }

  let extraCalls: { name: string; when: string }[] = [];
  try {
    const raw = data.extraCalls;
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
    if (Array.isArray(parsed)) {
      extraCalls = parsed
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({ name: String(c.name || ''), when: String(c.when || '') }));
    }
  } catch { extraCalls = []; }

  const s = (k: string) => (data[k] == null ? '' : String(data[k]));
  return {
    schedule,
    extraCalls,
    tasksMorning: s('tasksMorning'), tasksLunch: s('tasksLunch'), tasksTea: s('tasksTea'), tasksBed: s('tasksBed'),
    numberOfCarers: s('numberOfCarers'), carePackageInfo: s('carePackageInfo'), otherNotes: s('otherNotes'),
    reviewDate: s('reviewDate'),
  };
}

// Lists a client's completed care-plan reviews. Each opens as a read-only /
// printable snapshot rendered from the fields captured at review time.
export default function CarePlanHistory({ serviceUser }: { serviceUser: ServiceUser }) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['care-plan-versions', serviceUser.id],
    queryFn: () => carePlanVersionsApi.list(serviceUser.id),
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function open(id: string, autoPrint: boolean, createdAt: string) {
    setBusy(id);
    try {
      const v = await carePlanVersionsApi.get(id);
      const data = snapshotToPrintData(v.data);
      printCarePlan(serviceUser, data, {
        autoPrint,
        // The snapshot preserves when the plan itself was created/updated.
        createdAt: (v.data.createdAt as string) || createdAt,
        updatedAt: (v.data.updatedAt as string) || createdAt,
      });
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
          <button className="text-xs text-blue-600 hover:underline shrink-0" disabled={busy === v.id} onClick={() => open(v.id, false, v.createdAt)}>View</button>
          <button className="text-xs text-blue-600 hover:underline shrink-0" disabled={busy === v.id} onClick={() => open(v.id, true, v.createdAt)}>Print</button>
        </div>
      ))}
    </div>
  );
}

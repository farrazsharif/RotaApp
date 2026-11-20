import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supervisionApi, SpotCheck } from '../api/supervision';

/**
 * A carer's earlier spot checks, shown under their row.
 *
 * The register only ever exposed the LAST check, so everything before it was
 * invisible in the app - you could see that somebody was up to date without
 * being able to see the trail that made them up to date. Which is the half an
 * inspector asks for.
 *
 * Fetched when the row is opened rather than with the table: fifty carers'
 * histories on every page load, to show none of them, is a lot of query for
 * nothing.
 */

/** Concerns on a single check: an item answered No. Matches the summary. */
function concernCount(answers: string): number | null {
  try {
    const parsed = JSON.parse(answers) as Record<string, { answer?: string }>;
    const vals = Object.values(parsed || {});
    if (!vals.length) return null;
    return vals.filter((v) => v?.answer === 'NO').length;
  } catch {
    return null;
  }
}

export default function SpotCheckHistoryRows({
  carerId,
  latestId,
  onView,
  onEdit,
}: {
  carerId: string;
  latestId: string | null;
  onView: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['spot-checks', carerId],
    queryFn: () => supervisionApi.listSpotChecks(carerId),
  });

  if (isLoading) {
    return (
      <tr className="bg-gray-50/60">
        <td colSpan={7} className="px-4 py-3 pl-12 text-xs text-gray-400">Loading earlier spot checks…</td>
      </tr>
    );
  }

  const earlier = [...data]
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .filter((c) => c.id !== latestId);

  if (earlier.length === 0) {
    return (
      <tr className="bg-gray-50/60">
        <td colSpan={7} className="px-4 py-3 pl-12 text-xs text-gray-400">
          No earlier spot checks — this is the first.
        </td>
      </tr>
    );
  }

  return (
    <>
      {earlier.map((c: SpotCheck) => {
        const concerns = concernCount(c.answers);
        return (
          <tr key={c.id} className="bg-gray-50/60 text-gray-600">
            <td className="px-4 py-2 pl-12 text-xs text-gray-500">earlier spot check</td>
            <td className="px-4 py-2" />
            <td className="hidden lg:table-cell px-4 py-2 text-gray-600">
              {format(new Date(c.date), 'dd MMM yyyy')}
              {c.source === 'paper' && (
                <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                  Paper
                </span>
              )}
            </td>
            {/* Next due belongs to the newest check only: it is one date per
                carer, not one per visit. */}
            <td className="px-4 py-2 text-gray-300">—</td>
            <td className="hidden xl:table-cell px-4 py-2">
              {concerns === null ? (
                <span className="text-gray-300">—</span>
              ) : (
                <span className={`text-xs px-2 py-1 rounded-full ${concerns > 0 ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'}`}>
                  {concerns > 0 ? `${concerns} concern${concerns === 1 ? '' : 's'}` : 'No concerns'}
                </span>
              )}
            </td>
            <td className="hidden xl:table-cell px-4 py-2 text-gray-600">{c.observerName || '—'}</td>
            <td className="px-4 py-2 text-right">
              <span className="flex gap-2 justify-end items-center">
                <button className="btn-secondary btn btn-sm" onClick={() => onView(c.id)}>View</button>
                <button className="text-xs text-blue-600 hover:underline" onClick={() => onEdit(c.id)}>Edit</button>
              </span>
            </td>
          </tr>
        );
      })}
    </>
  );
}

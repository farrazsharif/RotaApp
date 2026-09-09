import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { likesDislikesVersionsApi } from '../api/likesDislikesVersions';
import { printLikesDislikes, LikesDislikesPrintData } from '../lib/likesDislikesPrint';
import { ServiceUser } from '../types';

// Turn a frozen snapshot into the shape printLikesDislikes expects.
function snapshotToPrintData(data: Record<string, unknown>): LikesDislikesPrintData {
  const s = (k: string) => (data[k] == null ? '' : String(data[k]));
  return {
    likes: s('likes'), dislikes: s('dislikes'), lifeHistory: s('lifeHistory'), health: s('health'),
    whatPeopleLike: s('whatPeopleLike'), relationships: s('relationships'), goodDay: s('goodDay'), badDay: s('badDay'),
  };
}

// Lists a client's completed Likes & Dislikes reviews. Each opens as a read-only /
// printable snapshot rendered from the fields captured at review time.
export default function LikesDislikesHistory({ serviceUser }: { serviceUser: ServiceUser }) {
  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['likes-dislikes-versions', serviceUser.id],
    queryFn: () => likesDislikesVersionsApi.list(serviceUser.id),
  });
  const [busy, setBusy] = useState<string | null>(null);

  async function open(id: string, autoPrint: boolean, createdAt: string) {
    setBusy(id);
    try {
      const v = await likesDislikesVersionsApi.get(id);
      const data = snapshotToPrintData(v.data);
      printLikesDislikes(serviceUser, data, {
        autoPrint,
        // The snapshot preserves when the record itself was created/updated.
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

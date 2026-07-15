import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { announcementsApi } from '../api/announcements';

export default function Announcements() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementsApi.list,
    refetchInterval: 60000,
  });

  // Opening the wall marks the latest as seen (hides the Today banner).
  useEffect(() => {
    if (items[0]) localStorage.setItem('ann_seen', items[0].id);
  }, [items]);

  async function refresh() {
    setRefreshing(true);
    try { await qc.invalidateQueries(); } finally { setRefreshing(false); }
  }

  return (
    <Layout title="Announcements" onRefresh={refresh} refreshing={refreshing}>
      {isLoading ? (
        <p className="text-center text-gray-400 py-8">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          <p className="text-4xl mb-2">📣</p>
          <p>No announcements yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="rounded-2xl bg-white border border-gray-200 shadow-sm p-4">
              <div className="flex items-center gap-2 flex-wrap">
                {a.targetUserId
                  ? <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">For you</span>
                  : <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Everyone</span>}
                <span className="text-xs text-gray-400">{a.authorName} · {format(new Date(a.createdAt), 'EEE d MMM, h:mm a')}</span>
              </div>
              {a.title && <p className="font-semibold text-gray-900 mt-1.5">{a.title}</p>}
              <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{a.body}</p>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}

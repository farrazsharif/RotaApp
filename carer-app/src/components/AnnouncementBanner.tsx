import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { announcementsApi } from '../api/announcements';

// Shows the latest unseen announcement on the Today screen. Tapping opens the
// full Announcements wall and marks it seen (so the banner clears).
export default function AnnouncementBanner() {
  const navigate = useNavigate();
  const { data: items = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementsApi.list,
    refetchInterval: 60000,
  });
  const [seen, setSeen] = useState(() => localStorage.getItem('ann_seen') || '');

  const latest = items[0];
  if (!latest || latest.id === seen) return null;

  return (
    <button
      onClick={() => { localStorage.setItem('ann_seen', latest.id); setSeen(latest.id); navigate('/announcements'); }}
      className="w-full text-left rounded-2xl border-2 border-blue-300 bg-blue-50 p-4 mb-4"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-blue-700">
        📣 {latest.targetUserId ? 'Message for you' : 'Announcement'}
      </p>
      {latest.title && <p className="font-semibold text-gray-900 mt-1">{latest.title}</p>}
      <p className="text-sm text-gray-700 mt-0.5">{latest.body}</p>
      <p className="text-xs text-blue-600 font-medium mt-1">Tap to view all →</p>
    </button>
  );
}

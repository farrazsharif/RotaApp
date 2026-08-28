import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { placementsApi, type MyPlacement } from '../api/placements';

const isoKey = (s: string) => format(new Date(s), 'yyyy-MM-dd');
const todayKey = () => format(new Date(), 'yyyy-MM-dd');

// Shows the carer's live-in placements (current one highlighted, upcoming listed).
// Renders nothing when the carer has no live-in placements.
export default function LiveInPlacementCard() {
  const navigate = useNavigate();
  const { data: placements = [] } = useQuery({ queryKey: ['my-placements'], queryFn: placementsApi.mine });

  if (placements.length === 0) return null;

  const today = todayKey();
  const current = placements.find((p) => isoKey(p.startDate) <= today && today <= isoKey(p.endDate));
  const upcoming = placements.filter((p) => isoKey(p.startDate) > today);

  const name = (p: MyPlacement) => (p.serviceUser ? `${p.serviceUser.firstName} ${p.serviceUser.lastName}` : 'Client');

  return (
    <div className="mb-4">
      {current && (
        <button
          onClick={() => navigate(`/placement/${current.id}`)}
          className="w-full text-left rounded-2xl bg-blue-600 text-white shadow-sm p-4 active:bg-blue-700"
        >
          <p className="text-xs uppercase tracking-wide text-blue-100">Live-in — on placement now</p>
          <p className="text-lg font-semibold">{name(current)}</p>
          <p className="text-sm text-blue-100">
            {isoKey(current.startDate)} → {isoKey(current.endDate)} · {current.nightType === 'WAKING' ? '🌙 Waking night' : '😴 Sleep-in'}
          </p>
          <p className="text-sm mt-1 font-medium">Open daily log →</p>
        </button>
      )}
      {upcoming.length > 0 && (
        <div className={`rounded-2xl bg-white border border-gray-200 shadow-sm p-3 ${current ? 'mt-2' : ''}`}>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Upcoming live-in</p>
          {upcoming.map((p) => (
            <button key={p.id} onClick={() => navigate(`/placement/${p.id}`)} className="w-full text-left py-1.5 border-b last:border-0 border-gray-100">
              <span className="font-medium text-gray-800">{name(p)}</span>
              <span className="text-sm text-gray-500"> · {isoKey(p.startDate)} → {isoKey(p.endDate)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

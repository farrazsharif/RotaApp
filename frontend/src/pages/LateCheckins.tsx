import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '../api/reports';
import { formatTime12h } from '../lib/time';

export default function LateCheckins() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['late-checkins'],
    queryFn: reportsApi.lateCheckins,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline mb-2">← Dashboard</button>
        <h1 className="text-2xl font-bold text-gray-900">Late / missed check-ins</h1>
        <p className="text-sm text-gray-500">
          Today's assigned visits that started 15+ minutes ago with no clock-in yet.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-gray-600 font-medium">No late or missed check-ins right now.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Service User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Visit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Carer(s)</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Late by</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatTime12h(r.startTime)}–{formatTime12h(r.endTime)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.serviceUserName}</td>
                  <td className="px-4 py-3 text-gray-600">{r.visitName || '—'}</td>
                  <td className="px-4 py-3 text-gray-800">{r.carers.length ? r.carers.join(', ') : <span className="text-red-600">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{r.serviceUserPhone || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="badge-red badge whitespace-nowrap">
                      {r.minutesLate >= 60 ? `${Math.floor(r.minutesLate / 60)}h ${r.minutesLate % 60}m` : `${r.minutesLate} min`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

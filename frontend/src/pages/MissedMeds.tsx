import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '../api/reports';
import { formatTime12h } from '../lib/time';

export default function MissedMeds() {
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['missed-meds'],
    queryFn: reportsApi.missedMeds,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-5">
      <div>
        <button onClick={() => navigate('/')} className="text-sm text-blue-600 hover:underline mb-2">← Dashboard</button>
        <h1 className="text-2xl font-bold text-gray-900">Meds missed today</h1>
        <p className="text-sm text-gray-500">
          Medication doses marked as Absent / missed today — which client, which carer, and the visit it was due on.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>
      ) : rows.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">✅</p>
          <p className="text-gray-600 font-medium">No missed medications today.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Due</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Service User</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Medication</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Visit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{formatTime12h(r.doseTime)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.serviceUserName}</td>
                  <td className="px-4 py-3 text-gray-800">
                    {r.medName}{r.medDose ? <span className="text-gray-500"> · {r.medDose}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {r.visitName || '—'}
                    {r.visitStart && r.visitEnd && (
                      <span className="text-gray-400"> ({formatTime12h(r.visitStart)}–{formatTime12h(r.visitEnd)})</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{r.carerName || <span className="text-gray-400">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-gray-500">{r.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clockApi } from '../api/clock';
import { useAuth } from '../contexts/AuthContext';
import { ClockRecord } from '../types';
import { format, differenceInMinutes, startOfWeek, endOfWeek } from 'date-fns';

function duration(record: ClockRecord) {
  if (!record.clockOut) return 'In progress';
  const mins = differenceInMinutes(new Date(record.clockOut), new Date(record.clockIn));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export default function Attendance() {
  const { isManager } = useAuth();
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['clock-records', startDate, endDate],
    queryFn: () => clockApi.records({ startDate, endDate }),
  });

  const totalHours = records.reduce((sum, r) => {
    if (!r.clockOut) return sum;
    return sum + differenceInMinutes(new Date(r.clockOut), new Date(r.clockIn)) / 60;
  }, 0);

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>

      <div className="card flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="input" />
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Hours</p>
          <p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}h</p>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">⏱️</p>
          <p>No clock records for this period</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {isManager && <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock In</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Patient / Call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((r: ClockRecord) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  {isManager && (
                    <td className="px-4 py-3 font-medium">{r.user.firstName} {r.user.lastName}</td>
                  )}
                  <td className="px-4 py-3 text-gray-600">{format(new Date(r.clockIn), 'EEE dd MMM')}</td>
                  <td className="px-4 py-3">{format(new Date(r.clockIn), 'HH:mm')}</td>
                  <td className="px-4 py-3">
                    {r.clockOut ? format(new Date(r.clockOut), 'HH:mm') : (
                      <span className="badge-green badge">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-blue-600">{duration(r)}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.shift
                      ? `${r.shift.serviceUser ? `${r.shift.serviceUser.firstName} ${r.shift.serviceUser.lastName} · ` : ''}${r.shift.startTime}–${r.shift.endTime}`
                      : '—'}
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

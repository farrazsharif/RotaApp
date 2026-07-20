import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clockApi } from '../api/clock';
import { usersApi } from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { ClockRecord } from '../types';
import { format, differenceInMinutes, startOfWeek, endOfWeek } from 'date-fns';
import { formatTime12h } from '../lib/time';

function duration(record: ClockRecord) {
  if (!record.clockOut) return 'In progress';
  const mins = differenceInMinutes(new Date(record.clockOut), new Date(record.clockIn));
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// The scheduled end of the visit this record belongs to, accounting for
// overnight calls (end earlier than start rolls to the next day). Used to
// distinguish a carer still on a live visit from a forgotten clock-out, and to
// pre-fill a sensible manual clock-out time.
function shiftEnd(r: ClockRecord): Date | null {
  if (!r.shift) return null;
  const base = new Date(r.shift.date);
  const [sh, sm] = r.shift.startTime.split(':').map(Number);
  const [eh, em] = r.shift.endTime.split(':').map(Number);
  const end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), eh, em, 0);
  if (eh * 60 + em <= sh * 60 + sm) end.setDate(end.getDate() + 1);
  return end;
}

// An open record whose visit finished more than 15 min ago is very likely a
// forgotten clock-out rather than a live visit.
function isMissedClockOut(r: ClockRecord): boolean {
  if (r.clockOut) return false;
  const end = shiftEnd(r);
  return !!end && Date.now() > end.getTime() + 15 * 60 * 1000;
}

const dtLocal = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

export default function Attendance() {
  const { isManager } = useAuth();
  const { can } = usePermissions();
  const qc = useQueryClient();
  const canEdit = can('manage_schedule');
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [carerId, setCarerId] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [outValue, setOutValue] = useState('');

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['clock-records', startDate, endDate, carerId],
    queryFn: () => clockApi.records({ startDate, endDate, userId: carerId || undefined }),
  });

  const { data: carers = [] } = useQuery({
    queryKey: ['users', 'active'],
    queryFn: () => usersApi.list({ active: true }),
    enabled: isManager,
  });

  const clockOutMut = useMutation({
    mutationFn: ({ id, clockOut }: { id: string; clockOut: string }) => clockApi.updateRecord(id, { clockOut }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-records'] });
      setEditingId(null);
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg || 'Could not save the clock-out time. Please try again.');
    },
  });

  function startClockOut(r: ClockRecord) {
    const end = shiftEnd(r);
    // Default to the visit's scheduled end if that's already passed (the usual
    // forgotten-clock-out case), otherwise now. Never suggest a future time.
    const suggested = end && end.getTime() <= Date.now() ? end : new Date();
    setOutValue(dtLocal(suggested));
    setEditingId(r.id);
  }

  function saveClockOut(r: ClockRecord) {
    if (!outValue) return;
    clockOutMut.mutate({ id: r.id, clockOut: new Date(outValue).toISOString() });
  }

  const totalHours = records.reduce((sum, r) => {
    if (!r.clockOut) return sum;
    return sum + differenceInMinutes(new Date(r.clockOut), new Date(r.clockIn)) / 60;
  }, 0);
  const missingCount = records.filter((r) => !r.clockOut).length;

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
        {isManager && (
          <div>
            <label className="label">Carer</label>
            <select value={carerId} onChange={(e) => setCarerId(e.target.value)} className="input min-w-[12rem]">
              <option value="">All carers</option>
              {carers.map((c) => (
                <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>
              ))}
            </select>
          </div>
        )}
        <div className="ml-auto flex gap-6 text-right">
          {isManager && missingCount > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">No clock-out</p>
              <p className="text-2xl font-bold text-amber-600">{missingCount}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Hours</p>
            <p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(1)}h</p>
          </div>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">⏱️</p>
          <p>No clock records for this period</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {isManager && <th className="text-left px-4 py-3 font-medium text-gray-600">Carer</th>}
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock In</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Clock Out</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Patient / Call</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {records.map((r: ClockRecord) => {
                const missed = isMissedClockOut(r);
                const editing = editingId === r.id;
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${missed ? 'bg-amber-50' : ''}`}>
                    {isManager && (
                      <td className="px-4 py-3 font-medium">{r.user.firstName} {r.user.lastName}</td>
                    )}
                    <td className="px-4 py-3 text-gray-600">{format(new Date(r.clockIn), 'EEE dd MMM')}</td>
                    <td className="px-4 py-3">{format(new Date(r.clockIn), 'h:mm a')}</td>
                    <td className="px-4 py-3">
                      {r.clockOut ? (
                        format(new Date(r.clockOut), 'h:mm a')
                      ) : editing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="datetime-local"
                            value={outValue}
                            max={dtLocal(new Date())}
                            onChange={(e) => setOutValue(e.target.value)}
                            className="input py-1 text-xs"
                          />
                          <button
                            onClick={() => saveClockOut(r)}
                            disabled={clockOutMut.isPending}
                            className="btn-primary btn btn-sm"
                          >
                            {clockOutMut.isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                        </div>
                      ) : (
                        <span className={missed ? 'badge-yellow badge' : 'badge-green badge'}>
                          {missed ? 'No clock-out' : 'Active'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-blue-600">{duration(r)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      <div className="flex items-center justify-between gap-3">
                        <span>
                          {r.shift
                            ? `${r.shift.serviceUser ? `${r.shift.serviceUser.firstName} ${r.shift.serviceUser.lastName} · ` : ''}${formatTime12h(r.shift.startTime)}–${formatTime12h(r.shift.endTime)}`
                            : '—'}
                        </span>
                        {canEdit && !r.clockOut && !editing && (
                          <button onClick={() => startClockOut(r)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            Clock out →
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

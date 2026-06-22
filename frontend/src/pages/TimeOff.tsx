import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { timeOffApi } from '../api/timeOff';
import { useAuth } from '../contexts/AuthContext';
import { TimeOffRequest } from '../types';
import { format } from 'date-fns';

const statusBadge: Record<string, string> = {
  PENDING: 'badge-yellow',
  APPROVED: 'badge-green',
  REJECTED: 'badge-red',
};

const typeColors: Record<string, string> = {
  VACATION: 'badge-blue',
  SICK: 'badge-red',
  PERSONAL: 'badge-purple',
  OTHER: 'badge-gray',
};

export default function TimeOff() {
  const { isManager } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ startDate: '', endDate: '', type: 'VACATION', reason: '' });

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['time-off'],
    queryFn: () => timeOffApi.list(),
  });

  const createMut = useMutation({
    mutationFn: () => timeOffApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['time-off'] }); setShowNew(false); setForm({ startDate: '', endDate: '', type: 'VACATION', reason: '' }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) => timeOffApi.update(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-off'] }),
  });

  const deleteMut = useMutation({
    mutationFn: timeOffApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['time-off'] }),
  });

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Time Off</h1>
        <button className="btn-primary btn" onClick={() => setShowNew(true)}>+ Request Time Off</button>
      </div>

      {showNew && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800">New Time-Off Request</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="input" />
            </div>
            <div>
              <label className="label">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
              <option value="VACATION">Vacation</option>
              <option value="SICK">Sick Leave</option>
              <option value="PERSONAL">Personal</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Reason (optional)</label>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2} className="input resize-none" />
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary btn" onClick={() => setShowNew(false)}>Cancel</button>
            <button
              className="btn-primary btn"
              disabled={!form.startDate || !form.endDate || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Submit Request
            </button>
          </div>
        </div>
      )}

      {requests.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🏖️</p>
          <p>No time-off requests yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r: TimeOffRequest) => (
            <div key={r.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-800">{r.user.firstName} {r.user.lastName}</p>
                    <span className={typeColors[r.type]}>{r.type}</span>
                    <span className={statusBadge[r.status]}>{r.status}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {format(new Date(r.startDate), 'dd MMM yyyy')} → {format(new Date(r.endDate), 'dd MMM yyyy')}
                  </p>
                  {r.reason && <p className="text-sm text-gray-500 mt-1 italic">"{r.reason}"</p>}
                  <p className="text-xs text-gray-400 mt-1">Submitted {format(new Date(r.createdAt), 'dd MMM yyyy')}</p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {isManager && r.status === 'PENDING' && (
                    <>
                      <button className="btn-success btn btn-sm" onClick={() => updateMut.mutate({ id: r.id, status: 'APPROVED' })}>Approve</button>
                      <button className="btn-danger btn btn-sm" onClick={() => updateMut.mutate({ id: r.id, status: 'REJECTED' })}>Reject</button>
                    </>
                  )}
                  {!isManager && r.status === 'PENDING' && (
                    <button className="btn-secondary btn btn-sm" onClick={() => deleteMut.mutate(r.id)}>Cancel</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tradesApi } from '../api/shiftTrades';
import { shiftsApi } from '../api/shifts';
import { useAuth } from '../contexts/AuthContext';
import { ShiftTrade } from '../types';
import { format } from 'date-fns';
import { formatTime12h } from '../lib/time';

const statusBadge: Record<string, string> = {
  PENDING: 'badge-yellow',
  ACCEPTED: 'badge-blue',
  REJECTED: 'badge-red',
  APPROVED: 'badge-green',
  CANCELLED: 'badge-gray',
};

export default function ShiftTrades() {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [message, setMessage] = useState('');

  const { data: trades = [], isLoading } = useQuery({
    queryKey: ['trades'],
    queryFn: () => tradesApi.list(),
  });

  const { data: myShifts = [] } = useQuery({
    queryKey: ['shifts', 'my'],
    queryFn: () => shiftsApi.list({ userId: user?.id }),
  });

  const createMut = useMutation({
    mutationFn: () => tradesApi.create({ shiftId: selectedShiftId, message }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['trades'] }); setShowNew(false); setSelectedShiftId(''); setMessage(''); },
  });

  const respondMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'accept' | 'reject' }) => tradesApi.respond(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'reject' }) => tradesApi.approve(id, action),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => tradesApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades'] }),
  });

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shift Trades</h1>
        <button className="btn-primary btn" onClick={() => setShowNew(true)}>+ Request Trade</button>
      </div>

      {showNew && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-800">New Trade Request</h2>
          <div>
            <label className="label">Your Shift to Trade</label>
            <select value={selectedShiftId} onChange={(e) => setSelectedShiftId(e.target.value)} className="input">
              <option value="">Select a shift…</option>
              {myShifts
                .filter((s) => s.status === 'SCHEDULED' && new Date(s.date) >= new Date())
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {format(new Date(s.date), 'EEE dd MMM')} · {formatTime12h(s.startTime)}–{formatTime12h(s.endTime)} {s.role ? `(${s.role})` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="label">Message (optional)</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="input resize-none" placeholder="Reason for trade request…" />
          </div>
          <div className="flex gap-3">
            <button className="btn-secondary btn" onClick={() => setShowNew(false)}>Cancel</button>
            <button
              className="btn-primary btn"
              disabled={!selectedShiftId || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Submit Request
            </button>
          </div>
        </div>
      )}

      {trades.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🔄</p>
          <p>No shift trade requests yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.map((t: ShiftTrade) => (
            <div key={t.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-800">
                      {t.requester.firstName} {t.requester.lastName}
                    </p>
                    <span className="text-gray-400 text-sm">→</span>
                    <p className="text-gray-600 text-sm">
                      {format(new Date(t.shift.date), 'EEE dd MMM')} · {formatTime12h(t.shift.startTime)}–{formatTime12h(t.shift.endTime)}
                      {t.shift.role ? ` · ${t.shift.role}` : ''}
                    </p>
                    <span className={statusBadge[t.status]}>{t.status}</span>
                  </div>
                  {t.message && <p className="text-sm text-gray-500 mt-1 italic">"{t.message}"</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {format(new Date(t.createdAt), 'dd MMM yyyy h:mm a')}
                  </p>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {/* Target user can accept/reject */}
                  {t.status === 'PENDING' && t.targetUserId === user?.id && (
                    <>
                      <button className="btn-success btn btn-sm" onClick={() => respondMut.mutate({ id: t.id, action: 'accept' })}>Accept</button>
                      <button className="btn-danger btn btn-sm" onClick={() => respondMut.mutate({ id: t.id, action: 'reject' })}>Reject</button>
                    </>
                  )}
                  {/* Manager can approve accepted trades */}
                  {t.status === 'ACCEPTED' && isManager && (
                    <>
                      <button className="btn-success btn btn-sm" onClick={() => approveMut.mutate({ id: t.id, action: 'approve' })}>Approve</button>
                      <button className="btn-danger btn btn-sm" onClick={() => approveMut.mutate({ id: t.id, action: 'reject' })}>Reject</button>
                    </>
                  )}
                  {/* Requester can cancel */}
                  {t.status === 'PENDING' && t.requesterId === user?.id && (
                    <button className="btn-secondary btn btn-sm" onClick={() => cancelMut.mutate(t.id)}>Cancel</button>
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

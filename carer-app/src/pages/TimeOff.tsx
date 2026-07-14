import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { timeOffApi, type TimeOffType, type TimeOffRequest } from '../api/timeOff';

const TYPES: { value: TimeOffType; label: string }[] = [
  { value: 'VACATION', label: 'Holiday' },
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_STYLES: Record<TimeOffRequest['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const today = () => new Date().toISOString().slice(0, 10);

export default function TimeOff() {
  const qc = useQueryClient();
  const [type, setType] = useState<TimeOffType>('VACATION');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['my-time-off'],
    queryFn: timeOffApi.mine,
  });

  const createMut = useMutation({
    mutationFn: () => timeOffApi.create({ startDate, endDate, type, reason: reason.trim() || undefined }),
    onSuccess: () => {
      setReason('');
      setError('');
      qc.invalidateQueries({ queryKey: ['my-time-off'] });
    },
    onError: (err: any) => setError(err?.response?.data?.error || 'Could not send request.'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => timeOffApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-time-off'] }),
  });

  function submit() {
    if (endDate < startDate) { setError('End date cannot be before start date.'); return; }
    createMut.mutate();
  }

  function handleCancel(r: TimeOffRequest) {
    if (r.status === 'APPROVED' &&
      !window.confirm('Cancel this approved leave? Your calls for those dates may already have been covered by someone else — a manager will rebalance if needed.')) return;
    cancelMut.mutate(r.id);
  }

  return (
    <Layout title="Time Off">
      <div className="space-y-4">
        {/* Request form */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
          <h2 className="font-semibold text-gray-800 mb-3">Request time off</h2>

          <label className="block text-sm text-gray-600 mb-1">Type</label>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setType(t.value)}
                className={`rounded-lg py-2 text-sm font-medium border ${
                  type === t.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">To</label>
              <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <label className="block text-sm text-gray-600 mb-1">Reason (optional)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="Add a note for your manager…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-3" />

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

          <button
            onClick={submit}
            disabled={createMut.isPending}
            className="w-full bg-blue-600 text-white rounded-xl py-3 font-bold disabled:opacity-50"
          >
            {createMut.isPending ? 'Sending…' : 'Submit Request'}
          </button>
        </div>

        {/* My requests */}
        <div>
          <h2 className="font-semibold text-gray-800 mb-2 px-1">My requests</h2>
          {isLoading ? (
            <p className="text-center text-gray-400 py-6">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-center text-gray-400 py-6">No requests yet.</p>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">
                      {TYPES.find((t) => t.value === r.type)?.label || r.type}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status]}`}>
                      {r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {format(new Date(r.startDate), 'EEE d MMM yyyy')} – {format(new Date(r.endDate), 'EEE d MMM yyyy')}
                  </p>
                  {r.reason && <p className="text-sm text-gray-500 mt-1 italic">“{r.reason}”</p>}
                  {r.status === 'APPROVED' && (
                    <p className="text-xs text-gray-400 mt-1">To postpone, cancel this and submit new dates above.</p>
                  )}
                  {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                    <button
                      onClick={() => handleCancel(r)}
                      disabled={cancelMut.isPending}
                      className="mt-2 text-sm font-medium text-red-600 disabled:opacity-50"
                    >
                      {r.status === 'APPROVED' ? 'Cancel leave' : 'Cancel request'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

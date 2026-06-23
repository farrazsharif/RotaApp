import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import Layout from '../components/Layout';
import { clockApi } from '../api/clock';
import { useAuth } from '../contexts/AuthContext';
import { isCallDone } from '../lib/shiftStatus';
import type { Shift } from '../types';

function nowMinutes() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function toMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export default function Today() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: calls = [], isLoading } = useQuery({
    queryKey: ['my-calls'],
    queryFn: () => clockApi.myCalls(),
    refetchInterval: 60000,
  });

  const sorted = [...calls].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
  const now = nowMinutes();
  const pending = sorted.filter((s) => s.status !== 'CANCELLED' && !isCallDone(s, user?.id));
  const nextCall = pending.find((s) => toMinutes(s.endTime) >= now) || pending[0];

  return (
    <Layout title={`Today · ${format(new Date(), 'EEE d MMM')}`}>
      {isLoading && <p className="text-center text-gray-400 py-8">Loading your calls…</p>}

      {!isLoading && sorted.length === 0 && (
        <div className="text-center text-gray-400 py-16">
          <p className="text-4xl mb-2">☀️</p>
          <p>No calls scheduled today.</p>
        </div>
      )}

      {!isLoading && sorted.length > 0 && (
        <div className="space-y-3">
          {sorted.map((s) => {
            const isNext = s.id === nextCall?.id;
            return (
              <CallCard key={s.id} shift={s} highlighted={isNext} done={isCallDone(s, user?.id)} onClick={() => navigate(`/call/${s.id}`)} />
            );
          })}
        </div>
      )}
    </Layout>
  );
}

function CallCard({ shift, highlighted, done, onClick }: { shift: Shift; highlighted: boolean; done: boolean; onClick: () => void }) {
  const su = shift.serviceUser;
  const name = su ? `${su.firstName} ${su.lastName}` : 'Service user';
  const isCancelled = shift.status === 'CANCELLED';

  return (
    <button
      onClick={onClick}
      disabled={isCancelled}
      className={`w-full text-left rounded-2xl p-4 shadow-sm border transition-colors ${
        done
          ? 'bg-green-50 border-green-300 text-gray-500'
          : highlighted
          ? 'bg-blue-600 border-blue-600 text-white'
          : isCancelled
          ? 'bg-gray-100 border-gray-200 text-gray-400 opacity-70'
          : 'bg-white border-gray-200 text-gray-800'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-bold text-base">{shift.startTime}–{shift.endTime}</span>
        {done && <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ Done</span>}
        {!done && highlighted && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded-full">NEXT</span>}
        {isCancelled && <span className="text-xs font-bold">Cancelled</span>}
      </div>
      <p className="text-lg font-semibold mt-1">{name}</p>
      {shift.visitName && (
        <p className={`text-sm ${highlighted && !done ? 'text-blue-100' : 'text-gray-500'}`}>{shift.visitName}</p>
      )}
      {su?.address && (
        <p className={`text-sm mt-1 ${highlighted && !done ? 'text-blue-100' : 'text-gray-400'}`}>
          📍 {su.address}{su.postcode ? `, ${su.postcode}` : ''}
        </p>
      )}
    </button>
  );
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { handoversApi, type Handover } from '../api/handovers';
import { formatTime12h } from '../lib/time';

// Incoming "please cover my call" requests from other carers, shown at the top
// of the Today page. Accepting reassigns the call so it appears on your rota.
export default function CoverRequests() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['my-handovers'],
    queryFn: handoversApi.mine,
    refetchInterval: 60000,
  });

  const respondMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'ACCEPT' | 'DECLINE' }) => handoversApi.respond(id, action),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-handovers'] });
      qc.invalidateQueries({ queryKey: ['my-calls'] });
    },
  });

  const incoming = data?.incoming ?? [];
  if (incoming.length === 0) return null;

  return (
    <div className="space-y-3 mb-4">
      {incoming.map((h: Handover) => {
        const su = h.shift.serviceUser;
        const name = su ? `${su.firstName} ${su.lastName}` : 'a client';
        return (
          <div key={h.id} className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">🤝 Cover Request</p>
            <p className="mt-1 text-gray-800">
              <span className="font-semibold">{h.fromUser.firstName} {h.fromUser.lastName}</span> has asked you to cover:
            </p>
            <p className="mt-1 font-semibold text-gray-900">
              {name} · {format(new Date(h.shift.date), 'EEE d MMM')}
            </p>
            <p className="text-sm text-gray-600">
              {formatTime12h(h.shift.startTime)}–{formatTime12h(h.shift.endTime)}
              {h.shift.serviceUser?.site?.name ? ` · ${h.shift.serviceUser.site.name}` : ''}
            </p>
            {h.reason && <p className="mt-1 text-sm text-gray-500 italic">“{h.reason}”</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => respondMut.mutate({ id: h.id, action: 'ACCEPT' })}
                disabled={respondMut.isPending}
                className="flex-1 rounded-xl bg-green-600 py-2.5 font-bold text-white disabled:opacity-50"
              >
                Accept & Cover
              </button>
              <button
                onClick={() => respondMut.mutate({ id: h.id, action: 'DECLINE' })}
                disabled={respondMut.isPending}
                className="flex-1 rounded-xl border border-gray-300 bg-white py-2.5 font-semibold text-gray-700 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

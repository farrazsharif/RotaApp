import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { handoversApi, type Handover } from '../api/handovers';

const STATUS_STYLES: Record<Handover['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  ACCEPTED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-gray-100 text-gray-500',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REVERTED: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<Handover['status'], string> = {
  PENDING: 'Awaiting reply',
  ACCEPTED: 'Covered',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  REVERTED: 'Reverted',
};

export default function Handovers() {
  const qc = useQueryClient();
  const { data: handovers = [], isLoading } = useQuery({
    queryKey: ['handovers'],
    queryFn: handoversApi.list,
    refetchInterval: 30000,
  });

  const revertMut = useMutation({
    mutationFn: (id: string) => handoversApi.revert(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['handovers'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });

  function handleRevert(h: Handover) {
    const su = h.shift.serviceUser;
    const name = su ? `${su.firstName} ${su.lastName}` : 'this call';
    if (!window.confirm(`Revert this cover? ${name} will go back to ${h.fromUser.firstName} ${h.fromUser.lastName}.`)) return;
    revertMut.mutate(h.id);
  }

  if (isLoading) return <div className="flex justify-center p-8"><div className="animate-spin h-8 w-8 border-b-2 border-blue-600 rounded-full" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Shift Handovers</h1>
        <p className="text-sm text-gray-500">Carer-to-carer cover requests from the last 14 days. Accepted covers take effect immediately — revert one if it wasn't appropriate.</p>
      </div>

      {handovers.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No handovers in the last 14 days</div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Requested</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Call</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">From → To</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {handovers.map((h) => {
                const su = h.shift.serviceUser;
                const name = su ? `${su.firstName} ${su.lastName}` : '—';
                return (
                  <tr key={h.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{format(new Date(h.createdAt), 'dd MMM, h:mm a')}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{name}</div>
                      <div className="text-xs text-gray-500">
                        {format(new Date(h.shift.date), 'EEE d MMM')} · {h.shift.startTime}–{h.shift.endTime}
                        {su?.site?.name ? ` · ${su.site.name}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      {h.fromUser.firstName} {h.fromUser.lastName}
                      <span className="text-gray-400"> → </span>
                      {h.toUser.firstName} {h.toUser.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-[200px]">{h.reason || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[h.status]}`}>
                        {STATUS_LABEL[h.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {h.status === 'ACCEPTED' && (
                        <button
                          className="btn btn-sm border border-red-200 text-red-600 hover:bg-red-50"
                          disabled={revertMut.isPending}
                          onClick={() => handleRevert(h)}
                        >
                          Revert
                        </button>
                      )}
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

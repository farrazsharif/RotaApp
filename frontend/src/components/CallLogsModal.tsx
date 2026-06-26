import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { callLogsApi } from '../api/callLogs';
import { ServiceUser } from '../types';
import { format } from 'date-fns';
import { formatTime12h } from '../lib/time';

interface Props {
  serviceUser: ServiceUser;
  onClose: () => void;
}

export default function CallLogsModal({ serviceUser, onClose }: Props) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['call-logs', serviceUser.id],
    queryFn: () => callLogsApi.list(serviceUser.id),
  });

  const addMut = useMutation({
    mutationFn: () => callLogsApi.create({ serviceUserId: serviceUser.id, note: note.trim() }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['call-logs', serviceUser.id] }); setNote(''); },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">Call Logs — {serviceUser.firstName} {serviceUser.lastName}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Add a log */}
          <div className="space-y-2">
            <label className="label">Add a call log</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Notes from this visit…"
              className="input resize-none"
            />
            <div className="flex justify-end">
              <button
                className="btn-primary btn"
                disabled={!note.trim() || addMut.isPending}
                onClick={() => addMut.mutate()}
              >
                {addMut.isPending ? 'Saving…' : 'Add Log'}
              </button>
            </div>
          </div>

          {/* History */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">History</h3>
            {isLoading ? (
              <div className="flex justify-center p-4"><div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" /></div>
            ) : logs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No call logs yet</p>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span className="font-medium text-gray-700">
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Unknown carer'}
                      </span>
                      <span>{format(new Date(log.createdAt), 'EEE dd MMM yyyy, h:mm a')}</span>
                    </div>
                    {log.shift && (
                      <p className="text-[11px] text-gray-400 mb-1">
                        Visit: {formatTime12h(log.shift.startTime)}–{formatTime12h(log.shift.endTime)}{log.shift.visitName ? ` · ${log.shift.visitName}` : ''}
                      </p>
                    )}
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{log.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

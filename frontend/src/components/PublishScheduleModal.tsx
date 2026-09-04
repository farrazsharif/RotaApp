import { useState } from 'react';
import AutoGrowTextarea from './AutoGrowTextarea';

type NotifyMode = 'none' | 'carers' | 'all';

interface Props {
  rangeLabel: string;
  readyCount: number;
  needsCarerCount: number;
  conflictCount: number;
  isPending: boolean;
  onClose: () => void;
  onPublish: (opts: { notify: NotifyMode; message: string }) => void;
}

// Publish confirmation: shows what will go out for the current timeline, lets
// the manager choose who gets notified, and attach a custom message.
export default function PublishScheduleModal({ rangeLabel, readyCount, needsCarerCount, conflictCount, isPending, onClose, onPublish }: Props) {
  const [notify, setNotify] = useState<NotifyMode>('carers');
  const [message, setMessage] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Publish schedule</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl" aria-label="Close">×</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5">
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-sm text-gray-500">Publish shifts in the current timeline</p>
            <p className="text-sm font-medium text-gray-900">{rangeLabel}</p>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Ready to publish</span>
                <span className="font-semibold text-green-700">{readyCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Still need a carer</span>
                <span className={`font-semibold ${needsCarerCount ? 'text-amber-600' : 'text-gray-400'}`}>{needsCarerCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Conflicts (double-booked carer)</span>
                <span className={`font-semibold ${conflictCount ? 'text-red-600' : 'text-gray-400'}`}>{conflictCount}</span>
              </div>
            </div>
            {needsCarerCount > 0 && (
              <p className="mt-3 text-xs text-amber-600">{needsCarerCount} visit{needsCarerCount > 1 ? 's' : ''} still need a carer and won’t be published.</p>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Notifications</p>
            <div className="space-y-2">
              {([
                ['none', 'Don’t notify anyone'],
                ['carers', 'Notify assigned carers'],
                ['all', 'Notify carers and the office'],
              ] as [NotifyMode, string][]).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2.5 text-sm text-gray-800 cursor-pointer">
                  <input type="radio" name="notify" checked={notify === value} onChange={() => setNotify(value)} className="accent-blue-600" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {notify !== 'none' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Add a message (optional)</label>
              <AutoGrowTextarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                minRows={3}
                placeholder="e.g. Rota for next week is live — please check your shifts and let the office know of any issues."
                className="input w-full"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t">
          <button className="btn btn-secondary" onClick={onClose} disabled={isPending}>Cancel</button>
          <button
            className="btn bg-green-600 text-white hover:bg-green-700"
            disabled={isPending || readyCount === 0}
            onClick={() => onPublish({ notify, message: message.trim() })}
          >
            {isPending ? 'Publishing…' : `Publish ${readyCount} shift${readyCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}

import { clearOutboxFailures, outboxFailures } from '../lib/outbox';
import { useOnline, usePendingCount } from '../lib/useOffline';

// Tells the carer what's happening with their connection and anything still
// waiting to sync, so they trust the app and don't re-enter work.
export default function OfflineBanner() {
  const online = useOnline();
  const pending = usePendingCount();
  const failures = outboxFailures();

  if (online && pending === 0 && failures.length === 0) return null;

  return (
    <div className="shrink-0">
      {!online && (
        <div className="bg-amber-100 border-b border-amber-300 px-4 py-2 text-center">
          <p className="text-sm font-semibold text-amber-900">No internet — you can keep working</p>
          <p className="text-xs text-amber-800">
            {pending > 0
              ? `${pending} ${pending === 1 ? 'entry is' : 'entries are'} saved on this phone and will send automatically.`
              : 'Anything you record is saved on this phone and sends automatically.'}
          </p>
        </div>
      )}

      {online && pending > 0 && (
        <div className="bg-blue-100 border-b border-blue-300 px-4 py-2 text-center">
          <p className="text-xs font-semibold text-blue-900">
            Sending {pending} saved {pending === 1 ? 'entry' : 'entries'}…
          </p>
        </div>
      )}

      {failures.length > 0 && (
        <div className="bg-red-100 border-b border-red-300 px-4 py-2 flex items-center gap-2">
          <p className="text-xs font-semibold text-red-900 flex-1">
            {failures.length} saved {failures.length === 1 ? 'entry' : 'entries'} couldn’t be sent — tell your manager.
          </p>
          <button onClick={clearOutboxFailures} className="text-xs font-bold text-red-700 underline">
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

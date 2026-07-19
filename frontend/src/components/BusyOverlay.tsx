import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';

// A full-screen "please wait" overlay shown while a change is still being
// applied on the server. It only appears once an operation has run past a short
// delay — so quick saves (a single-shift edit) never flash a loader, while a
// heavy fan-out (reassign a carer across all future shifts, bulk publish, etc.)
// shows it and blocks further clicks until the server confirms. A max-duration
// guard means a stuck/slow request can never lock the screen indefinitely.
export default function BusyOverlay() {
  const mutating = useIsMutating();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (mutating > 0) {
      const showTimer = setTimeout(() => setShow(true), 400);
      const maxTimer = setTimeout(() => setShow(false), 20000);
      return () => { clearTimeout(showTimer); clearTimeout(maxTimer); };
    }
    setShow(false);
  }, [mutating]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/25 flex items-center justify-center"
      style={{ cursor: 'wait' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex items-center gap-3">
        <div className="animate-spin h-6 w-6 border-b-2 border-blue-600 rounded-full" />
        <span className="text-sm font-medium text-gray-800">Applying your changes… please wait</span>
      </div>
    </div>
  );
}

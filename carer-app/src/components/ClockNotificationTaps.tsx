import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onClockNotificationTap } from '../lib/clockNotification';

// Tapping the pinned "still clocked in" notification opens that visit, so the
// carer can clock out in one step rather than landing on the app's home screen
// and hunting for it. Native only — on the web the service worker handles the
// click. Renders nothing.
export default function ClockNotificationTaps() {
  const navigate = useNavigate();
  useEffect(() => {
    let off: (() => void) | undefined;
    let cancelled = false;
    void onClockNotificationTap((url) => navigate(url)).then((unsubscribe) => {
      // The listener resolves asynchronously, so it can land after this effect
      // has already been cleaned up — drop it rather than leak it.
      if (cancelled) { unsubscribe(); return; }
      off = unsubscribe;
    });
    return () => { cancelled = true; off?.(); };
  }, [navigate]);
  return null;
}

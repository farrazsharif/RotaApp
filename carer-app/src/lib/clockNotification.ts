// A single pinned "you're still clocked in" notification, shown while the carer
// has an open clock-in and cleared the moment they clock out. It's the
// forgotten-clock-out reminder: a sticky entry in the phone's notification
// shade (requireInteraction keeps it pinned on Android; iOS shows it but may
// not keep it pinned). Tapping it opens the call so they can clock out in one
// step. No live timer — just a persistent presence.
//
// A fixed tag means re-showing replaces rather than stacks, so re-pinning on app
// open (in case it was swiped away) never produces duplicates.
const TAG = 'clocked-in';

function canNotify(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

// Ask for notification permission if the carer hasn't decided yet. Best-effort —
// returns false (silently) if unsupported or denied.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function showClockedInNotification(clientName: string, url = '/'): Promise<void> {
  if (!canNotify() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("You're clocked in", {
      body: `${clientName ? `${clientName} — ` : ''}still clocked in. Tap to clock out.`,
      tag: TAG,
      renotify: false,
      requireInteraction: true,
      silent: true,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url },
    } as NotificationOptions);
  } catch {
    /* notifications unavailable — ignore */
  }
}

export async function clearClockedInNotification(): Promise<void> {
  if (!canNotify()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const notes = await reg.getNotifications({ tag: TAG });
    notes.forEach((n) => n.close());
  } catch {
    /* ignore */
  }
}

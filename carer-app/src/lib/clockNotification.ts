import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// A single pinned "you're still clocked in" notification, shown while the carer
// has an open clock-in and cleared the moment they clock out. It's the
// forgotten-clock-out reminder: a sticky entry in the phone's notification
// shade. Tapping it opens the call so they can clock out in one step. No live
// timer — just a persistent presence.
//
// Which mechanism is used depends on the platform, because no single one works
// everywhere — and on iOS the right answer is none at all:
//
//   Web / PWA — a service worker notification (requireInteraction pins it).
//   Android   — the Capacitor LocalNotifications plugin, pinned via `ongoing`.
//   iOS       — nothing. The Live Activity already puts a running timer on the
//               Lock Screen for exactly the same stretch of time, so adding a
//               banner would be the same reminder twice.
//
// The native app deliberately registers no service worker (see main.tsx: the
// WebView already serves the bundled assets, and a service worker there just
// cache-fights the native layer). So the web path's `navigator.serviceWorker
// .ready` waited for a registration that never arrived — the promise never
// settled and the reminder silently never appeared. On iOS that was masked,
// because the Live Activity does the same job from the Lock Screen; on Android
// there is no Live Activity, so there was nothing at all.

// A fixed tag/id means re-showing replaces rather than stacks, so re-pinning on
// app open (in case it was swiped away) never produces duplicates.
const TAG = 'clocked-in';
const NATIVE_ID = 1001;

// Android gets the plugin; iOS deliberately gets nothing (see above); the web
// keeps the service worker path.
const isAndroid = Capacitor.getPlatform() === 'android';
const isNative = Capacitor.isNativePlatform();

function canNotifyWeb(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

function bodyFor(clientName: string): string {
  return `${clientName ? `${clientName} — ` : ''}still clocked in. Tap to clock out.`;
}

// Ask for notification permission if the carer hasn't decided yet. Best-effort —
// returns false (silently) if unsupported or denied. Called at clock-in rather
// than at launch, which is both a better moment to ask and what Android 13+
// expects: POST_NOTIFICATIONS is a runtime permission there, and the plugin's
// manifest merges it into the app.
export async function ensureNotificationPermission(): Promise<boolean> {
  if (isAndroid) {
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') return true;
      if (current.display === 'denied') return false;
      const asked = await LocalNotifications.requestPermissions();
      return asked.display === 'granted';
    } catch {
      return false;
    }
  }
  if (isNative) return false; // iOS: the Live Activity is the reminder
  if (!canNotifyWeb()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

export async function showClockedInNotification(clientName: string, url = '/'): Promise<void> {
  if (isAndroid) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      await LocalNotifications.schedule({
        notifications: [{
          id: NATIVE_ID,
          title: "You're clocked in",
          body: bodyFor(clientName),
          // No `schedule` key — show it now, not later. That is also why the
          // manifest drops SCHEDULE_EXACT_ALARM, which this plugin would
          // otherwise merge in unused.
          // `ongoing` keeps it pinned and unswipeable, the counterpart of the
          // web path's requireInteraction.
          ongoing: true,
          autoCancel: false,
          extra: { url },
        }],
      });
    } catch {
      /* notifications unavailable — ignore */
    }
    return;
  }

  if (isNative) return; // iOS: the Live Activity is the reminder
  if (!canNotifyWeb() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("You're clocked in", {
      body: bodyFor(clientName),
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
  if (isAndroid) {
    try {
      await LocalNotifications.cancel({ notifications: [{ id: NATIVE_ID }] });
    } catch {
      /* ignore */
    }
    return;
  }
  if (isNative) return;
  if (!canNotifyWeb()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const notes = await reg.getNotifications({ tag: TAG });
    notes.forEach((n) => n.close());
  } catch {
    /* ignore */
  }
}

// Tapping the notification should land on the visit, so clocking out is one
// step. On the web the service worker handles the click (see sw.ts); natively
// it arrives as a plugin event, which is what this subscribes to. Returns an
// unsubscribe function.
export async function onClockNotificationTap(go: (url: string) => void): Promise<() => void> {
  if (!isAndroid) return () => {};
  try {
    const handle = await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const url = (event.notification?.extra as { url?: string } | undefined)?.url;
      if (url) go(url);
    });
    return () => { void handle.remove(); };
  } catch {
    return () => {};
  }
}

import { useEffect } from 'react';
import { pushApi } from '../api/push';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Registers for push once a carer is logged in, so they get a reminder
// 30 minutes before a call and another right when it starts — covers the
// case where the app isn't open and they'd otherwise forget to clock in.
export function usePushSubscription(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    (async () => {
      try {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
        }
        if (Notification.permission !== 'granted') return;

        const publicKey = await pushApi.getVapidKey();
        if (!publicKey || cancelled) return;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
          });
        }
        if (cancelled) return;
        await pushApi.subscribe(subscription.toJSON() as PushSubscriptionJSON);
      } catch (err) {
        console.error('Push subscription failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);
}

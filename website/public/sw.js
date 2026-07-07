// Self-destroying service worker.
//
// The app used to live on this origin (caremid.co.uk) and installed a PWA
// service worker at /sw.js. The app has since moved to portal.caremid.co.uk
// and this origin now serves the marketing website. Browsers that visited the
// old app still have its service worker cached and would keep serving the app
// shell offline-first, never loading this website.
//
// When those browsers do their routine background check for a /sw.js update
// they receive THIS worker instead. It unregisters itself, clears all caches,
// and reloads any open tabs so they fetch the real website from the network.
// After it runs once, the origin is clean and no service worker remains.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Delete every cache the old app created.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      // Remove this (and thus the old) service worker registration.
      await self.registration.unregister();

      // Reload open tabs so they load the website fresh from the network.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});

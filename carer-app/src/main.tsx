import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { startOutbox } from './lib/outbox'
import { CARER_CACHE_KEY } from './lib/offlineCache'

// True when running inside the native app. Detected via the global Capacitor
// injects into the WebView (checked without importing @capacitor/core, so the
// web/PWA bundle stays completely free of Capacitor).
const isNativeApp = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
  .Capacitor?.isNativePlatform?.()

// Web only: register the service worker so the PWA always runs the latest
// deployed build (re-checks on focus / reconnect / hourly, then autoUpdate
// reloads). Inside the native app the assets are already bundled and the WebView
// serves them locally, so a service worker is redundant and can cache-fight the
// native layer — skip it there.
if (!isNativeApp) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() { updateSW(true) },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => { registration.update().catch(() => {}) }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
      setInterval(check, 60 * 60 * 1000)
    },
  })
}

// Keep a week of cached data on the device so the app opens and works with no
// signal (rota, visit details, due meds) instead of showing empty screens.
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000

// localStorage allows roughly 5MB per origin for the WHOLE cache. The
// 'my-shifts' query alone is 8 weeks of visits with the full include -
// measured at 2.3MB for a busy carer - and once the total goes over, setItem
// throws QuotaExceededError, the write is abandoned and NOTHING is persisted.
// The app then opens empty with no signal, which is the exact failure the
// cache exists to prevent.
//
// So persist only what a carer actually needs in a building with no reception:
// today's visits, the visit they are on, its meds and the client's recent
// logs. The 8-week rota is a planning view - useful, but not worth losing the
// lot for.
const NEVER_PERSIST = new Set(['my-shifts'])

// A quota failure must degrade, not throw: losing one write is survivable,
// taking the app down on a cache write is not.
const storage = {
  getItem: (k: string) => window.localStorage.getItem(k),
  removeItem: (k: string) => window.localStorage.removeItem(k),
  setItem: (k: string, v: string) => {
    try { window.localStorage.setItem(k, v) } catch { /* over quota - skip this write */ }
  },
}
const persister = createSyncStoragePersister({ storage, key: CARER_CACHE_KEY })

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Treat data as fresh for a minute so switching tabs renders instantly
      // from cache instead of spinner + refetch. Live changes still come through
      // the socket (LiveSync invalidates), and each screen has a manual refresh.
      staleTime: 60_000,
      // Keep cached data for as long as it is persisted. gcTime must be >= the
      // persisted maxAge below, or restored entries are garbage-collected
      // before the app can use them offline.
      gcTime: CACHE_MAX_AGE,
    },
  },
})

// Replay anything recorded offline as soon as we have a connection.
startOutbox()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{
      persister,
      maxAge: CACHE_MAX_AGE,
      // Bumped so any cache written under the old all-in scheme is discarded
      // rather than carried forward half-written.
      buster: 'v2',
      dehydrateOptions: {
        shouldDehydrateQuery: (q) =>
          q.state.status === 'success' && !NEVER_PERSIST.has(String(q.queryKey[0])),
      },
    }}>
      <App />
    </PersistQueryClientProvider>
  </StrictMode>,
)

// deploy marker: force carerapp Vercel rebuild (revert to 2-week Rota)
// redeploy trigger 20260714125530
// webhook test 134036
// deploy after carerapp git reconnect 142634

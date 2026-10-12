import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // Treat data as fresh for a minute so switching tabs renders instantly
      // from cache instead of spinner + refetch. Live changes still come through
      // the socket (LiveSync invalidates), and each screen has a manual refresh.
      staleTime: 60_000,
      // Keep cached data for 30 min so returning to a screen is instant.
      gcTime: 30 * 60_000,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)

// deploy marker: force carerapp Vercel rebuild (revert to 2-week Rota)
// redeploy trigger 20260714125530
// webhook test 134036
// deploy after carerapp git reconnect 142634

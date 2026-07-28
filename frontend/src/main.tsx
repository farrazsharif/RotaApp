import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';
import { installPasteNormalizer } from './lib/pasteNormalize';

// Tidy whitespace in anything pasted into a field (stray/doubled spaces).
installPasteNormalizer();

// Always run the latest deployed version. Register the service worker
// immediately, then re-check for a new build whenever the tab regains focus or
// the network reconnects (and hourly while left open). With registerType
// 'autoUpdate' the new worker takes over and reloads the page on its own.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() { updateSW(true); },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => { registration.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('online', check);
    setInterval(check, 60 * 60 * 1000);
  },
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);

// Key for the on-device copy of fetched data (rota, visits, due meds) that lets
// the app work with no signal. Kept in its own module so logout and the 401
// handler can wipe it without importing from main.tsx.
export const CARER_CACHE_KEY = 'caremid.carer.qc';

// Care data must not survive a sign-out — carers share phones, and the next
// person must not see the previous carer's clients.
export function clearOfflineCache(): void {
  try { localStorage.removeItem(CARER_CACHE_KEY); } catch { /* ignore */ }
}

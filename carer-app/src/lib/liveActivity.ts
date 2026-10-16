import { Capacitor, registerPlugin } from '@capacitor/core';

// iOS Live Activity: a ticking timer on the Lock Screen / Dynamic Island while
// the carer is clocked in.
//
// Registered the documented way (registerPlugin). An earlier version reached
// for window.Capacitor.Plugins directly to keep the web bundle Capacitor-free,
// but that isn't populated for custom plugins, so every call silently no-opped.
interface LiveActivityPlugin {
  start(args: { clientName: string; visitName: string; startedAt: number; endsAt?: number }): Promise<{
    started?: boolean;
    reason?: string;
  }>;
  end(): Promise<void>;
}

const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');

// Last outcome, surfaced on the Profile screen. There's no way to attach a
// debugger to a TestFlight build, so this is how we see what the widget did.
const STATUS_KEY = 'caremid.liveActivityStatus';

function setStatus(s: string): void {
  try { localStorage.setItem(STATUS_KEY, `${new Date().toLocaleTimeString()} — ${s}`); } catch { /* ignore */ }
}

export function liveActivityStatus(): string {
  try { return localStorage.getItem(STATUS_KEY) || 'not used yet'; } catch { return 'unavailable'; }
}

// Never let a widget problem break clocking in/out — it's a nicety, not the job.
export async function startVisitActivity(args: {
  clientName: string;
  visitName?: string | null;
  startedAt?: number;
  endsAt?: number;
}): Promise<void> {
  if (!Capacitor.isNativePlatform()) { setStatus('skipped (not the native app)'); return; }
  try {
    const res = await LiveActivity.start({
      clientName: args.clientName,
      visitName: args.visitName || '',
      startedAt: args.startedAt ?? Date.now(),
      ...(args.endsAt ? { endsAt: args.endsAt } : {}),
    });
    setStatus(res?.started ? 'started' : `not started (${res?.reason || 'unknown'})`);
  } catch (e) {
    setStatus(`error: ${(e as Error)?.message || String(e)}`);
  }
}

export async function endVisitActivity(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LiveActivity.end();
    setStatus('ended');
  } catch (e) {
    setStatus(`end error: ${(e as Error)?.message || String(e)}`);
  }
}

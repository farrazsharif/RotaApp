// iOS Live Activity: a ticking timer on the Lock Screen / Dynamic Island while
// the carer is clocked in.
//
// Reached through the global Capacitor bridge rather than by importing
// @capacitor/core, so the web/PWA bundle stays completely free of Capacitor
// (same approach as the native check in main.tsx). On the web, and on iOS below
// 16.2, every call here is a no-op.
interface LiveActivityPlugin {
  start(args: { clientName: string; visitName: string; startedAt: number; endsAt?: number }): Promise<unknown>;
  end(): Promise<unknown>;
}

function plugin(): LiveActivityPlugin | null {
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> };
  }).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return (cap.Plugins?.LiveActivity as LiveActivityPlugin | undefined) ?? null;
}

// Never let a widget problem break clocking in/out — it's a nicety, not the job.
export async function startVisitActivity(args: {
  clientName: string;
  visitName?: string | null;
  startedAt?: number;
  endsAt?: number;
}): Promise<void> {
  try {
    await plugin()?.start({
      clientName: args.clientName,
      visitName: args.visitName || '',
      startedAt: args.startedAt ?? Date.now(),
      ...(args.endsAt ? { endsAt: args.endsAt } : {}),
    });
  } catch { /* ignore */ }
}

export async function endVisitActivity(): Promise<void> {
  try { await plugin()?.end(); } catch { /* ignore */ }
}

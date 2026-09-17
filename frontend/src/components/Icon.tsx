import { ReactNode } from 'react';

// Small dependency-free line-icon set (Feather-style stroke paths) for compact
// toolbar buttons. Inherits colour from the parent (stroke: currentColor) and
// sizes to 16px by default. Decorative — always aria-hidden.
export type IconName = 'clock' | 'edit' | 'renew' | 'print' | 'plus' | 'eye' | 'close';

const PATHS: Record<IconName, ReactNode> = {
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 8 12 12 15 14" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>,
  renew: <><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8" /><polyline points="20 3 20 8 15 8" /><path d="M20 12a8 8 0 0 1-13.7 5.7L4 16" /><polyline points="4 21 4 16 9 16" /></>,
  print: <><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  eye: <><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" /></>,
  close: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
};

export default function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

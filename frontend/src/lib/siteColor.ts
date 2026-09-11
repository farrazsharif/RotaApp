// A site carries a hex colour (used for its location pill). To colour-code a
// service user by their site we reuse that colour two ways: a faint card wash
// (the colour blended ~8% over white) and a solid left accent bar. Blending is
// done in JS rather than CSS color-mix so it works on every browser, and any
// non-hex colour simply skips the wash (the accent bar still works with any CSS
// colour).
import type { CSSProperties } from 'react';

export function lightTint(hex?: string | null, pct = 0.08): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c * pct + 255 * (1 - pct));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// Inline style for an element colour-coded by a site: faint wash + left accent
// bar. Returns an empty object when there's no site so callers can spread it
// unconditionally.
export function siteTintStyle(color?: string | null, pct = 0.08): CSSProperties {
  if (!color) return {};
  const bg = lightTint(color, pct);
  return {
    borderLeftColor: color,
    borderLeftWidth: 4,
    ...(bg ? { backgroundColor: bg } : {}),
  };
}

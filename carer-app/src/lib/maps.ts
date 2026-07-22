// Build a cross-platform maps link for a client's address. On Android this
// opens the Google Maps app; on iOS it opens Google Maps if installed, else
// Maps in the browser; on desktop it opens in the browser. Returns null when
// there's nothing to search for.
export function mapsUrl(address?: string | null, postcode?: string | null): string | null {
  const q = [address, postcode].filter((p) => p && String(p).trim()).join(', ').trim();
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

import { Request, Response } from 'express';

// Proxies getAddress.io so the API key stays server-side. Free tier: 20 lookups/day.
// Sign up at https://getaddress.io and set GETADDRESS_API_KEY in the backend env.
export async function lookupAddresses(req: Request, res: Response) {
  const postcode = String(req.query.postcode || '').trim();
  if (!postcode) return res.status(400).json({ error: 'postcode is required' });

  const apiKey = process.env.GETADDRESS_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Address lookup is not configured. Set GETADDRESS_API_KEY on the backend.' });
  }

  const url = `https://api.getaddress.io/find/${encodeURIComponent(postcode)}?api-key=${apiKey}&expand=true`;
  const upstream = await fetch(url);

  if (upstream.status === 404) {
    return res.json({ addresses: [] });
  }
  if (!upstream.ok) {
    return res.status(502).json({ error: 'Address lookup failed' });
  }

  const data = await upstream.json() as {
    latitude: number; longitude: number;
    addresses: { line_1: string; line_2: string; line_3: string; town_or_city: string; county: string }[];
  };

  const addresses = data.addresses.map((a) => ({
    line1: a.line_1,
    line2: [a.line_2, a.line_3].filter(Boolean).join(', '),
    townOrCity: a.town_or_city,
    county: a.county,
    formatted: [a.line_1, a.line_2, a.line_3, a.town_or_city, a.county].filter(Boolean).join(', '),
  }));

  res.json({ addresses });
}

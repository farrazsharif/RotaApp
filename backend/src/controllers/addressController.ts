import { Request, Response } from 'express';

// Proxies GoAddress (goaddress.io) so the API token stays server-side. Markets a
// genuinely free tier with no card required, unlike getAddress.io and OS Places API
// which both turned out to need a paid plan. Sign up at https://goaddress.io and set
// GOADDRESS_API_TOKEN in the backend env.
export async function lookupAddresses(req: Request, res: Response) {
  const postcode = String(req.query.postcode || '').trim();
  if (!postcode) return res.status(400).json({ error: 'postcode is required' });

  const token = process.env.GOADDRESS_API_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'Address lookup is not configured. Set GOADDRESS_API_TOKEN on the backend.' });
  }

  const url = `https://portal.goaddress.io/api/address/search?q=${encodeURIComponent(postcode.replace(/\s+/g, ''))}`;
  const upstream = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!upstream.ok) {
    const body = await upstream.text();
    console.error(`goaddress.io lookup failed: ${upstream.status} ${body.slice(0, 300)}`);
    return res.status(502).json({ error: `Address lookup failed (upstream ${upstream.status}): ${body.slice(0, 300)}` });
  }

  const data = await upstream.json() as {
    new_address_res?: {
      house_no?: string; building_name?: string; street?: string;
      post_town?: string; city?: string; town?: string; county?: string; postcode?: string;
    }[];
    addresses?: string[];
  };

  const addresses = data.new_address_res?.length
    ? data.new_address_res.map((a) => {
        const line1 = [a.house_no, a.building_name, a.street].filter(Boolean).join(', ');
        const townOrCity = a.post_town || a.city || a.town || '';
        return {
          line1,
          line2: '',
          townOrCity,
          county: a.county || '',
          formatted: [line1, townOrCity, a.county, a.postcode].filter(Boolean).join(', '),
        };
      })
    : (data.addresses || []).map((formatted) => ({ line1: formatted, line2: '', townOrCity: '', county: '', formatted }));

  res.json({ addresses });
}

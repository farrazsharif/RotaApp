import { Request, Response } from 'express';

// Proxies the OS Places API (Ordnance Survey, via OS Data Hub) so the API key stays
// server-side. Its free "OS Data Hub Public Sector / Freemium" plan doesn't require a
// card, unlike getAddress.io's free tier. Sign up at https://osdatahub.os.uk and set
// OS_PLACES_API_KEY in the backend env.
export async function lookupAddresses(req: Request, res: Response) {
  const postcode = String(req.query.postcode || '').trim();
  if (!postcode) return res.status(400).json({ error: 'postcode is required' });

  const apiKey = process.env.OS_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Address lookup is not configured. Set OS_PLACES_API_KEY on the backend.' });
  }

  const url = `https://api.os.uk/search/places/v1/postcode?postcode=${encodeURIComponent(postcode)}&key=${apiKey}`;
  const upstream = await fetch(url);
  const data = await upstream.json() as {
    results?: { DPA: {
      ADDRESS: string; BUILDING_NUMBER?: string; BUILDING_NAME?: string; SUB_BUILDING_NAME?: string;
      THOROUGHFARE_NAME?: string; DEPENDENT_LOCALITY?: string; POST_TOWN: string; POSTCODE: string;
    } }[];
    error?: { statuscode: string; message: string };
  };

  if (!upstream.ok) {
    console.error(`OS Places API lookup failed: ${upstream.status}`, JSON.stringify(data).slice(0, 300));
    // OS Places returns 400 with error.message "Invalid postcode variable" for anything
    // it can't parse as a postcode shape (not necessarily a real failure worth surfacing).
    if (data.error?.message?.toLowerCase().includes('postcode')) {
      return res.json({ addresses: [] });
    }
    return res.status(502).json({ error: `Address lookup failed (upstream ${upstream.status}): ${data.error?.message || 'unknown error'}` });
  }

  const addresses = (data.results || []).map(({ DPA }) => {
    const line1 = [DPA.SUB_BUILDING_NAME, DPA.BUILDING_NAME, DPA.BUILDING_NUMBER, DPA.THOROUGHFARE_NAME].filter(Boolean).join(', ');
    return {
      line1,
      line2: DPA.DEPENDENT_LOCALITY || '',
      townOrCity: DPA.POST_TOWN,
      county: '',
      formatted: DPA.ADDRESS,
    };
  });

  res.json({ addresses });
}

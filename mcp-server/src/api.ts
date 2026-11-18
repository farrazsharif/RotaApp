/**
 * Caremid API client.
 *
 * Caremid has no API-key mechanism: authentication is a JWT obtained by
 * logging in, valid for seven days. So this signs in once with the service
 * account's credentials, keeps the token in memory, and signs in again when
 * the API rejects it. The password is read from the environment and is never
 * logged, returned to the model, or written anywhere.
 */

export const API_BASE_URL = (process.env.CAREMID_API_URL || 'https://api.caremid.co.uk/api').replace(/\/$/, '');
export const CHARACTER_LIMIT = 25_000;

const EMAIL = process.env.CAREMID_AGENT_EMAIL;
const PASSWORD = process.env.CAREMID_AGENT_PASSWORD;

const MISSING_CREDENTIALS =
  'Caremid credentials are not set. The MCP server needs CAREMID_AGENT_EMAIL and ' +
  'CAREMID_AGENT_PASSWORD in its environment — the service account created for it in ' +
  'Caremid, not a personal login. Set them where the server is launched, then restart it.';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Turns an HTTP status into something the model can act on rather than a bare
 * code. These are the statuses the Caremid API actually returns.
 */
function httpErrorMessage(status: number, body: string): string {
  const detail = body ? ` (${body.slice(0, 200)})` : '';
  switch (status) {
    case 401:
      return `Caremid rejected the service account's credentials${detail}. Check CAREMID_AGENT_EMAIL and CAREMID_AGENT_PASSWORD, and that the account is still active.`;
    case 402:
      return "Caremid returned 402: the company's subscription is inactive or the trial has lapsed. Nothing can be read until that is resolved in the billing settings.";
    case 403:
      return `The service account does not have permission for this${detail}. Its role in Caremid needs the matching capability — ask an admin to widen it, and keep it to the minimum that works.`;
    case 404:
      return `Caremid has no such record${detail}. Check the id is current; it may have been deleted.`;
    case 429:
      return 'Caremid is rate-limiting these requests. Wait a minute before trying again.';
    default:
      return status >= 500
        ? `Caremid returned a server error (${status})${detail}. This is the API, not the request — retry shortly.`
        : `Caremid returned ${status}${detail}.`;
  }
}

let token: string | null = null;
let signingIn: Promise<string> | null = null;

async function signIn(signal: AbortSignal): Promise<string> {
  if (!EMAIL || !PASSWORD) throw new ApiError(401, MISSING_CREDENTIALS);

  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });

  if (!res.ok) {
    // Deliberately does not echo the request body: it holds the password.
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, httpErrorMessage(res.status, body));
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new ApiError(502, 'Caremid accepted the sign-in but returned no token.');
  return data.token;
}

/** One sign-in at a time, however many tools call in parallel. */
async function currentToken(signal: AbortSignal): Promise<string> {
  if (token) return token;
  if (!signingIn) {
    signingIn = signIn(signal)
      .then((t) => {
        token = t;
        return t;
      })
      .finally(() => {
        signingIn = null;
      });
  }
  return signingIn;
}

/**
 * GET a Caremid endpoint. Retries once on a 401, because a seven-day token
 * expires mid-session often enough that failing the tool call instead would
 * just mean the model retrying blind.
 */
export async function apiGet<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  signal: AbortSignal,
): Promise<T> {
  const attempt = async (bearer: string): Promise<Response> => {
    const url = new URL(`${API_BASE_URL}/${path.replace(/^\//, '')}`);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    return fetch(url, {
      headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
  };

  let res = await attempt(await currentToken(signal));
  if (res.status === 401) {
    token = null;
    res = await attempt(await currentToken(signal));
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, httpErrorMessage(res.status, body));
  }
  return (await res.json()) as T;
}

/**
 * POST to a Caremid endpoint. Same 401 retry as apiGet.
 *
 * Writes are deliberately rare here and each one is narrow. The rule the
 * write tools follow: an agent may CREATE a record in a state that does
 * nothing until a person acts on it, and may not move a record into the state
 * that has an effect on anyone. Filling the policy library is the first;
 * publishing a policy - which asks every carer to sign it - is the second.
 */
export async function apiPost<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const attempt = async (bearer: string): Promise<Response> =>
    fetch(`${API_BASE_URL}/${path.replace(/^\//, '')}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });

  let res = await attempt(await currentToken(signal));
  if (res.status === 401) {
    token = null;
    res = await attempt(await currentToken(signal));
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new ApiError(res.status, httpErrorMessage(res.status, text));
  }
  return (await res.json()) as T;
}

export const credentialsConfigured = () => !!EMAIL && !!PASSWORD;

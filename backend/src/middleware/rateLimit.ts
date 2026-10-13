import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

const FIFTEEN_MIN = 15 * 60 * 1000;

// Failed-login throttle, keyed per (client IP + email). Successful logins are
// skipped, so a whole office behind one IP and normal users are never affected —
// only repeated *failed* attempts on a given account from a given IP are blocked
// (10 per 15 min), which stops password-guessing / brute force.
export const loginLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase().trim() : '';
    return `${ipKeyGenerator(req.ip ?? '')}|${email}`;
  },
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// The other unauthenticated auth endpoints (signup, forgot-password,
// set-password) are low-volume legitimately — cap per IP to stop abuse.
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MIN,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

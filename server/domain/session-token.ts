/**
 * Signed, self-contained session tokens.
 *
 * There is no session table. A token is its own payload plus an HMAC over
 * it, so a request can be authenticated without a database round trip, and
 * revoking everything at once is a matter of changing SESSION_SECRET.
 *
 * WHY AN AUDIENCE
 * ---------------
 * This system issues two kinds of session that must never be interchangeable:
 * a school session, which names a school and a role inside it, and a platform
 * session, which names one of Midway's own staff and no school at all. They
 * are signed with the same secret, because there is only one.
 *
 * HMACs over the same key and the same payload shape are, by construction,
 * interchangeable — a token minted for one audience verifies perfectly for
 * the other. Cookie names do not help: cookies are attacker-supplied data.
 * So the audience label is mixed into the signed material itself. A school
 * token presented to the platform decoder fails the signature comparison,
 * not a field check that somebody could later forget to write.
 *
 * Kept free of `next/headers` on purpose, so the property above can be
 * tested directly rather than asserted in a comment.
 */

import crypto from 'crypto';

/** Anything carried in a token. Both kinds expire. */
export interface Expiring {
  /** Unix seconds. */
  expiresAt: number;
}

function signature(secret: string, audience: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${audience}:${body}`).digest('base64url');
}

export function encodeToken<T extends Expiring>(
  secret: string,
  audience: string,
  payload: T,
): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signature(secret, audience, body)}`;
}

/**
 * Returns the payload, or null for anything that is not a valid, unexpired
 * token for this audience.
 *
 * Every failure returns the same null: a caller that could tell "expired"
 * from "bad signature" would leak whether a forged token had the right
 * shape.
 */
export function decodeToken<T extends Expiring>(
  secret: string,
  audience: string,
  token: string | undefined,
  now: number = Date.now(),
): T | null {
  if (!token) return null;

  const [body, provided] = token.split('.');
  if (!body || !provided) return null;

  // Constant-time compare: a plain !== leaks, through timing, how many bytes
  // of a guessed signature were right, which is enough to build one.
  const expected = signature(secret, audience, body);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
    if (typeof payload?.expiresAt !== 'number') return null;
    if (payload.expiresAt * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** The two audiences that exist. Adding a third means adding it here. */
export const PORTAL_AUDIENCE = 'midway.portal.v1';
export const PLATFORM_AUDIENCE = 'midway.platform.v1';

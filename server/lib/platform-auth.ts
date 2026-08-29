/**
 * Sessions for the Midway platform console.
 *
 * WHY NOT REUSE lib/auth.ts
 * -------------------------
 * A school session is a tuple of (user, school, role), and everything
 * downstream — `requireSession`, `TenantDb` — reads the school out of it and
 * scopes every query to that one tenant. A platform administrator has no
 * school. Threading one through the same type would mean inventing a value
 * to mean "all of them", and the first place that value reached `TenantDb`
 * it would either throw or, worse, quietly scope to school 0.
 *
 * So the two session systems share a secret and nothing else:
 *
 *  - a different cookie name, so neither is even sent to the other's pages;
 *  - a different HMAC domain, so a school token that somehow reached this
 *    decoder cannot verify against it, and vice versa. This is the part that
 *    matters. Same-key HMACs over the same payload shape are interchangeable
 *    by construction; prefixing the signed material with a label that names
 *    the audience makes a school session cryptographically unusable here
 *    even if an attacker could choose the payload.
 */

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2';
import { getPool, PlatformDb } from '../db/tenant';
import { PLATFORM_AUDIENCE, decodeToken, encodeToken } from '../domain/session-token';

export const PLATFORM_COOKIE = 'midway_platform';

/**
 * Shorter than the school portal's ten hours.
 *
 * This session can suspend every school on the platform. It is used in short
 * deliberate visits, not left open all day beside a marks register, so a
 * laptop walked away from stops being useful sooner.
 */
const PLATFORM_MAX_AGE = 60 * 60 * 4;

export interface PlatformSession {
  platformUserId: number;
  name: string;
  email: string;
  /** Unix seconds. */
  expiresAt: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value === 'CHANGE_ME') {
    throw new Error('SESSION_SECRET is not set — refusing to issue sessions');
  }
  return value;
}

export function encodePlatformSession(session: PlatformSession): string {
  return encodeToken(secret(), PLATFORM_AUDIENCE, session);
}

export function decodePlatformSession(token: string | undefined): PlatformSession | null {
  const session = decodeToken<PlatformSession>(secret(), PLATFORM_AUDIENCE, token);
  if (!session) return null;
  // A school session could never reach this line — its signature is over a
  // different audience and fails the comparison inside decodeToken. This is
  // belt and braces for a payload that verified but carries no identity.
  if (!session.platformUserId) return null;
  return session;
}

interface PlatformUserRow extends RowDataPacket {
  id: number;
  display_name: string;
  email: string;
  password_hash: string;
  is_active: number;
}

/**
 * Verifies credentials against `platform_users`, and only that table.
 *
 * A school administrator's password does not work here, and a platform
 * password does not work at the school portal or in the family app, because
 * neither query ever looks at the other's table. That is a stronger
 * guarantee than a role check, which is one forgotten condition away from
 * being wrong.
 *
 * Returns the same null for every failure, so the response cannot be used to
 * find out who works at Midway.
 */
export async function authenticatePlatform(
  email: string,
  password: string,
): Promise<PlatformSession | null> {
  const pool = getPool();

  const [rows] = await pool.query<PlatformUserRow[]>(
    `SELECT id, display_name, email, password_hash, is_active
       FROM platform_users
      WHERE email = ?
      LIMIT 1`,
    [email.trim().toLowerCase()],
  );

  const user = rows[0];
  if (!user || !user.password_hash || !user.is_active) return null;
  if (!(await bcrypt.compare(password, user.password_hash))) return null;

  await pool.query('UPDATE platform_users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  return {
    platformUserId: user.id,
    name: user.display_name,
    email: user.email,
    expiresAt: Math.floor(Date.now() / 1000) + PLATFORM_MAX_AGE,
  };
}

export function setPlatformCookie(session: PlatformSession): void {
  cookies().set(PLATFORM_COOKIE, encodePlatformSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.ALLOW_INSECURE_COOKIES !== '1',
    // Scoped to the console. The school portal's pages never receive this
    // cookie at all, which is one less thing that can be confused for a
    // school session.
    path: '/platform',
    maxAge: PLATFORM_MAX_AGE,
  });
}

export function clearPlatformCookie(): void {
  cookies().delete({ name: PLATFORM_COOKIE, path: '/platform' });
}

export function currentPlatformSession(): PlatformSession | null {
  return decodePlatformSession(cookies().get(PLATFORM_COOKIE)?.value);
}

export class NotPlatformAdminError extends Error {
  constructor() {
    super('Not signed in to the platform console');
  }
}

/**
 * For console pages and actions.
 *
 * Returns a `PlatformDb`, which is cross-tenant by design — reaching for it
 * is meant to be a visible decision, and here it is the whole point.
 */
export function requirePlatformSession(): {
  session: PlatformSession;
  db: PlatformDb;
} {
  const session = currentPlatformSession();
  if (!session) throw new NotPlatformAdminError();
  return { session, db: new PlatformDb() };
}

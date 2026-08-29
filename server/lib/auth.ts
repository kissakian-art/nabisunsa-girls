/**
 * Sessions for the portal.
 *
 * Deliberately small: a signed cookie holding the user id, school id and
 * role, verified with an HMAC on every request. No session table to keep
 * clean, and no third-party dependency in the auth path.
 *
 * The school id lives in the signed cookie rather than in a URL or a form
 * field, so a user cannot reach another school's data by editing a request.
 * Everything downstream derives its tenant scope from here.
 */

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2';
import { getPool, TenantDb } from '../db/tenant';
import type { ActorRole } from '../domain/marksheet';
import { PORTAL_AUDIENCE, decodeToken, encodeToken } from '../domain/session-token';

export const SESSION_COOKIE = 'midway_session';

/** Portal: a school working day, plus slack. */
const PORTAL_MAX_AGE = 60 * 60 * 10;
/**
 * Mobile: 30 days. A parent opening the app to check a mark should not be
 * asked to sign in every time, and the token carries no more authority than
 * "show me my own child's released results".
 */
const MOBILE_MAX_AGE = 60 * 60 * 24 * 30;

export interface Session {
  userId: number;
  schoolId: number;
  role: ActorRole;
  name: string;
  /** Unix seconds. */
  expiresAt: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value === 'CHANGE_ME') {
    // Failing loudly beats signing sessions with a guessable key.
    throw new Error('SESSION_SECRET is not set — refusing to issue sessions');
  }
  return value;
}

export function encodeSession(session: Session): string {
  return encodeToken(secret(), PORTAL_AUDIENCE, session);
}

/**
 * The audience is what keeps this separate from the platform console's
 * sessions, which are signed with the same secret. See domain/session-token.ts
 * — a platform token presented here fails the signature, not a field check.
 */
export function decodeSession(token: string | undefined): Session | null {
  const session = decodeToken<Session>(secret(), PORTAL_AUDIENCE, token);
  if (!session) return null;
  // A school session is meaningless without all three: the tenant scope and
  // the role are both read straight off it.
  if (!session.userId || !session.schoolId || !session.role) return null;
  return session;
}

interface UserRow extends RowDataPacket {
  id: number;
  school_id: number;
  role: ActorRole;
  display_name: string;
  password_hash: string | null;
  is_active: number;
  school_status: string;
}

/** Which surface is signing in. They allow different roles entirely. */
export type Surface = 'portal' | 'mobile';

const ALLOWED_ROLES: Record<Surface, ActorRole[]> = {
  // Parents and students use the app; teachers do not use this system.
  portal: ['school_admin', 'dos', 'dos_staff'],
  // The app is for families only. School staff use the portal.
  mobile: ['student_parent'],
};

/**
 * Verifies credentials and returns a session, or null.
 *
 * Returns the same null for "no such user" and "wrong password" so the
 * response cannot be used to enumerate who works at or attends a school.
 */
export async function authenticate(
  identifier: string,
  password: string,
  surface: Surface = 'portal',
  schoolSlug?: string,
): Promise<Session | null> {
  const pool = getPool();
  const value = identifier.trim();

  // A parent signs in with whatever the school holds for them. Most families
  // here have a phone number and no email, so the app accepts either.
  //
  // Email is unique across the platform, so it identifies an account on its
  // own. A phone number is unique only within a school (the same number can
  // belong to families at two client schools), so it must be accompanied by
  // the school — which a branded app always knows, since it was built for
  // one school.
  const byPhone = !value.includes('@');
  if (byPhone && !schoolSlug) return null;

  const [rows] = await pool.query<UserRow[]>(
    byPhone
      ? `SELECT u.id, u.school_id, u.role, u.display_name, u.password_hash, u.is_active,
                s.status AS school_status
           FROM users u
           JOIN schools s ON s.id = u.school_id
          WHERE s.slug = ? AND u.phone = ?
          LIMIT 1`
      : `SELECT u.id, u.school_id, u.role, u.display_name, u.password_hash, u.is_active,
                s.status AS school_status
           FROM users u
           JOIN schools s ON s.id = u.school_id
          WHERE u.email = ?
          LIMIT 1`,
    byPhone ? [schoolSlug, normalisePhone(value)] : [value.toLowerCase()],
  );

  const user = rows[0];
  if (!user || !user.password_hash || !user.is_active) return null;

  // A suspended or closed school must not be able to log in at all — this is
  // how the platform owner actually disables a tenant.
  if (user.school_status !== 'active' && user.school_status !== 'trial') return null;

  // Each surface admits only its own roles: a parent cannot sign into the
  // portal, and school staff cannot sign into the family app.
  if (!ALLOWED_ROLES[surface].includes(user.role)) return null;

  if (!(await bcrypt.compare(password, user.password_hash))) return null;

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  return {
    userId: user.id,
    schoolId: user.school_id,
    role: user.role,
    name: user.display_name,
    expiresAt:
      Math.floor(Date.now() / 1000) +
      (surface === 'mobile' ? MOBILE_MAX_AGE : PORTAL_MAX_AGE),
  };
}

/**
 * One shape for a Ugandan phone number.
 *
 * A parent writes 0706 090021 on a form, the office types +256706090021, and
 * the parent then signs in with 0706090021. Those are one number, and
 * without this they are three accounts.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/[^0-9]/g, '');
  if (digits.startsWith('256')) return `0${digits.slice(3)}`;
  if (digits.startsWith('0')) return digits;
  // A bare 9-digit local number, as often written on a school form.
  if (digits.length === 9) return `0${digits}`;
  return digits;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function setSessionCookie(session: Session): void {
  cookies().set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: 'lax',
    // Caddy terminates HTTPS in production; only development serves plain HTTP.
    secure: process.env.ALLOW_INSECURE_COOKIES !== '1',
    path: '/',
    maxAge: PORTAL_MAX_AGE,
  });
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE);
}

export function currentSession(): Session | null {
  return decodeSession(cookies().get(SESSION_COOKIE)?.value);
}

/** Session plus a database handle already scoped to that user's school. */
export interface AuthContext {
  session: Session;
  db: TenantDb;
}

/**
 * For pages and actions that require a signed-in user.
 *
 * The returned handle is bound to the school in the signed cookie, so a
 * caller cannot widen its own scope even by mistake.
 */
export function requireSession(): AuthContext {
  const session = currentSession();
  if (!session) throw new UnauthenticatedError();
  return { session, db: new TenantDb(session.schoolId) };
}

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in');
  }
}

/** True when this role may verify, publish or withdraw marksheets. */
export function canRelease(role: ActorRole): boolean {
  return role === 'dos' || role === 'school_admin';
}

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

import crypto from 'crypto';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2';
import { getPool, TenantDb } from '../db/tenant';
import type { ActorRole } from '../domain/marksheet';

export const SESSION_COOKIE = 'midway_session';
const MAX_AGE_SECONDS = 60 * 60 * 10; // a school working day, plus slack

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

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  // Constant-time compare: a fast string !== leaks timing information about
  // how much of the signature matched.
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    if (!session.userId || !session.schoolId || !session.role) return null;
    if (session.expiresAt * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
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

/**
 * Verifies credentials and returns a session, or null.
 *
 * Returns the same null for "no such user" and "wrong password" so the
 * response cannot be used to enumerate who works at a school.
 */
export async function authenticate(
  email: string,
  password: string,
): Promise<Session | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    `SELECT u.id, u.school_id, u.role, u.display_name, u.password_hash, u.is_active,
            s.status AS school_status
       FROM users u
       JOIN schools s ON s.id = u.school_id
      WHERE u.email = ?
      LIMIT 1`,
    [email.trim().toLowerCase()],
  );

  const user = rows[0];
  if (!user || !user.password_hash || !user.is_active) return null;

  // A suspended or closed school must not be able to log in at all — this is
  // how the platform owner actually disables a tenant.
  if (user.school_status !== 'active' && user.school_status !== 'trial') return null;

  // Parents and students use the mobile app, not this portal.
  if (user.role === 'student_parent' || user.role === 'teacher') return null;

  if (!(await bcrypt.compare(password, user.password_hash))) return null;

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  return {
    userId: user.id,
    schoolId: user.school_id,
    role: user.role,
    name: user.display_name,
    expiresAt: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
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
    maxAge: MAX_AGE_SECONDS,
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

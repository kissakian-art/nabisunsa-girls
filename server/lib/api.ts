/**
 * Shared plumbing for the mobile API.
 *
 * The app authenticates with a bearer token rather than a cookie, but it is
 * the same signed payload the portal uses — one signing key, one expiry
 * check, no second auth path to keep correct.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: a family account can only ever see
 * its own children. The student is never taken from the request. It is
 * looked up from the signed token and checked against `students.user_id`, so
 * changing an id in a URL reaches nothing.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { decodeSession, Session } from './auth';
import { TenantDb } from '../db/tenant';

export interface ApiContext {
  session: Session;
  db: TenantDb;
}

export function bearerToken(request: NextRequest): string | undefined {
  const header = request.headers.get('authorization');
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer') return undefined;
  return token;
}

/**
 * Resolves the caller, or null when the token is missing, forged or expired.
 *
 * Only family accounts are admitted: a portal token presented to the app API
 * is rejected, so a staff session cannot be used to browse the family
 * endpoints.
 */
export function apiSession(request: NextRequest): ApiContext | null {
  const session = decodeSession(bearerToken(request));
  if (!session) return null;
  if (session.role !== 'student_parent') return null;
  return { session, db: new TenantDb(session.schoolId) };
}

export const unauthorized = () =>
  NextResponse.json({ error: 'Not signed in' }, { status: 401 });

export const notFound = (what = 'Not found') =>
  NextResponse.json({ error: what }, { status: 404 });

export const badRequest = (why: string) =>
  NextResponse.json({ error: why }, { status: 400 });

export const suspended = (reason: string | null) =>
  NextResponse.json(
    {
      error: reason || 'This school\u2019s portal is not active at the moment.',
      locked: true,
    },
    { status: 403 },
  );

interface StatusRow extends RowDataPacket {
  status: 'trial' | 'active' | 'suspended' | 'closed';
  suspendedReason: string | null;
}

/**
 * The tenant's commercial state.
 *
 * A school that stops paying is switched off here, not in the app: an app
 * can be patched, downgraded or run from an old APK, so the kill switch has
 * to live on the server to mean anything. `/api/me` still answers for a
 * suspended school — that is how the app knows to show the lock screen and
 * who to call — but nothing that carries a child's marks does.
 */
export async function schoolState(context: ApiContext): Promise<StatusRow> {
  const [row] = await context.db.raw<StatusRow>(
    `SELECT status, suspended_reason AS suspendedReason
       FROM schools WHERE id = :schoolId`,
  );
  return row;
}

/** True while the school may be served data. A trial is a paying state. */
export const isServable = (state: StatusRow) =>
  state.status === 'trial' || state.status === 'active';

export interface Child extends RowDataPacket {
  id: number;
  firstName: string;
  lastName: string;
  registrationNo: string;
  className: string;
  streamName: string | null;
  level: 'O-Level' | 'A-Level';
  photoUrl: string | null;
}

/**
 * The students this account is allowed to see.
 *
 * A family with two daughters at the school gets both, because
 * `students.user_id` may repeat.
 */
export async function childrenOf(context: ApiContext): Promise<Child[]> {
  return context.db.raw<Child>(
    `SELECT s.id,
            s.first_name  AS firstName,
            s.last_name   AS lastName,
            s.registration_no AS registrationNo,
            c.name        AS className,
            st.name       AS streamName,
            s.level,
            s.photo_url   AS photoUrl
       FROM students s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN streams st ON st.id = s.stream_id
      WHERE s.school_id = :schoolId
        AND s.user_id = ?
        AND s.status = 'active'
      ORDER BY s.first_name`,
    [context.session.userId],
  );
}

/**
 * Resolves a requested student id against this account's own children.
 *
 * Returns null for anything that is not theirs — another family's child, a
 * child at another school, or an id that does not exist. The caller turns
 * that into a 404 rather than a 403: confirming that a student exists would
 * itself leak something.
 */
export async function authorisedChild(
  context: ApiContext,
  studentId: number | null,
): Promise<Child | null> {
  const children = await childrenOf(context);
  if (children.length === 0) return null;
  if (studentId == null) return children[0];
  return children.find((child) => child.id === studentId) ?? null;
}

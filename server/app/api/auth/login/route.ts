import { NextRequest, NextResponse } from 'next/server';
import { authenticate, encodeSession } from '../../../../lib/auth';
import { badRequest } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

/**
 * Sign in from the mobile app.
 *
 * POST { email, password, school } -> { token, user }
 *
 * `email` may be an email address or a phone number; `school` is the slug
 * the app was built for, and is what makes a phone number unambiguous.
 *
 * The token is the same signed payload the portal uses, carried as a bearer
 * token instead of a cookie. It is issued only to family accounts: school
 * staff signing in here are refused exactly as an unknown user would be.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; school?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Expected a JSON body');
  }

  // "email" carries whatever the parent typed: most families here have a
  // phone number and no email address, and the app accepts either.
  const identifier = (body.email ?? '').trim();
  const password = body.password ?? '';
  if (!identifier || !password) {
    return badRequest('Email or phone number, and password, are required');
  }

  // A phone number is unique only within a school, so signing in with one
  // needs the school. A branded app always knows which school it is for.
  const session = await authenticate(identifier, password, 'mobile', body.school?.trim());
  if (!session) {
    // One message for every failure, so the response cannot be used to
    // discover which families attend the school.
    return NextResponse.json({ error: 'Those details were not recognised.' }, { status: 401 });
  }

  return NextResponse.json({
    token: encodeSession(session),
    expiresAt: session.expiresAt,
    user: { name: session.name, schoolId: session.schoolId },
  });
}

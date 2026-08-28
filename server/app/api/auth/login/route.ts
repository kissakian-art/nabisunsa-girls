import { NextRequest, NextResponse } from 'next/server';
import { authenticate, encodeSession } from '../../../../lib/auth';
import { badRequest } from '../../../../lib/api';

export const dynamic = 'force-dynamic';

/**
 * Sign in from the mobile app.
 *
 * POST { email, password } -> { token, user }
 *
 * The token is the same signed payload the portal uses, carried as a bearer
 * token instead of a cookie. It is issued only to family accounts: school
 * staff signing in here are refused exactly as an unknown user would be.
 */
export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Expected a JSON body');
  }

  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  if (!email || !password) return badRequest('Email and password are required');

  const session = await authenticate(email, password, 'mobile');
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

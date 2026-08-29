import { NextRequest, NextResponse } from 'next/server';
import { encodeSession, type Session } from '../../../../lib/auth';
import { badRequest } from '../../../../lib/api';
import { FamilyError, redeemInvite } from '../../../../lib/families';
import { callerKey, take } from '../../../../lib/ratelimit';

export const dynamic = 'force-dynamic';

/**
 * Turning a printed slip into an account.
 *
 * POST { school, registrationNo, code, password, displayName?, phone? }
 *   -> { token, expiresAt, user }
 *
 * This is the only unauthenticated endpoint that creates anything, so it is
 * also the only one worth attacking. Three things stand in the way: the code
 * is checked against one student rather than looked up (so there is nothing
 * to enumerate), every refusal reads the same (so nothing is learned from
 * trying), and the attempts are rate limited below.
 */

/** Generous for a parent typing badly; hopeless for guessing 24^6 codes. */
const PER_CALLER = { capacity: 10, windowMs: 60 * 60 * 1000 };
const PER_STUDENT = { capacity: 20, windowMs: 60 * 60 * 1000 };

export async function POST(request: NextRequest) {
  let body: {
    school?: string;
    registrationNo?: string;
    code?: string;
    password?: string;
    displayName?: string;
    phone?: string;
  };
  try {
    body = await request.json();
  } catch {
    return badRequest('Expected a JSON body');
  }

  const school = (body.school ?? '').trim();
  const registrationNo = (body.registrationNo ?? '').trim();
  const code = (body.code ?? '').trim();
  const password = body.password ?? '';

  if (!school) return badRequest('This app is not configured for a school');
  if (!registrationNo || !code) {
    return badRequest('Enter the registration number and the code from the slip');
  }

  const tooMany = NextResponse.json(
    { error: 'Too many attempts. Please wait a little and try again.' },
    { status: 429 },
  );
  if (!take(`activate:${callerKey(request)}`, PER_CALLER)) return tooMany;
  if (!take(`activate:${school}:${registrationNo.toLowerCase()}`, PER_STUDENT)) return tooMany;

  let outcome;
  try {
    outcome = await redeemInvite({
      schoolSlug: school,
      registrationNo,
      code,
      password,
      displayName: body.displayName,
      phone: body.phone,
    });
  } catch (error) {
    // A password that is too short is the parent's to fix and is worth
    // saying plainly; anything else is ours and says nothing.
    if (error instanceof FamilyError) return badRequest(error.message);
    throw error;
  }

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message }, { status: 400 });
  }

  // Signed in immediately. A parent who has just typed a code off a slip and
  // chosen a password should not then be asked to log in with them.
  const session: Session = {
    userId: outcome.result.userId,
    schoolId: outcome.result.schoolId,
    role: 'student_parent',
    name: outcome.result.displayName,
    expiresAt: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };

  return NextResponse.json({
    token: encodeSession(session),
    expiresAt: session.expiresAt,
    user: { name: session.name },
  });
}

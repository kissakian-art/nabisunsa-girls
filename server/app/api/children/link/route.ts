import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { apiSession, childrenOf, badRequest, unauthorized } from '../../../../lib/api';
import { FamilyError, redeemInvite } from '../../../../lib/families';
import { callerKey, take } from '../../../../lib/ratelimit';

export const dynamic = 'force-dynamic';

interface SlugRow extends RowDataPacket { slug: string }

const PER_CALLER = { capacity: 10, windowMs: 60 * 60 * 1000 };

/**
 * Adding a second child to an account that already exists.
 *
 * POST { registrationNo, code } -> { children }
 *
 * A family with two daughters gets two slips, and should end up with one
 * login rather than two. The account is taken from the signed token and the
 * school from that account — never from the request — so this can only ever
 * attach a child to the caller's own family, at the caller's own school.
 */
export async function POST(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  let body: { registrationNo?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Expected a JSON body');
  }

  const registrationNo = (body.registrationNo ?? '').trim();
  const code = (body.code ?? '').trim();
  if (!registrationNo || !code) {
    return badRequest('Enter the registration number and the code from the slip');
  }

  if (!take(`link:${callerKey(request)}`, PER_CALLER)) {
    return NextResponse.json(
      { error: 'Too many attempts. Please wait a little and try again.' },
      { status: 429 },
    );
  }

  const [school] = await context.db.raw<SlugRow>(
    'SELECT slug FROM schools WHERE id = :schoolId',
  );

  let outcome;
  try {
    outcome = await redeemInvite({
      schoolSlug: school.slug,
      registrationNo,
      code,
      // No password is set here: the account already has one. Something must
      // still satisfy the length rule, so the caller's own id is used and
      // never stored — the attach path does not touch password_hash.
      password: `attach-${context.session.userId}-${Date.now()}`,
      attachToUserId: context.session.userId,
    });
  } catch (error) {
    if (error instanceof FamilyError) return badRequest(error.message);
    throw error;
  }

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.message }, { status: 400 });
  }

  return NextResponse.json({ children: await childrenOf(context) });
}

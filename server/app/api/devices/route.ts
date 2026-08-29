import { NextRequest, NextResponse } from 'next/server';
import { apiSession, badRequest, unauthorized } from '../../../lib/api';

export const dynamic = 'force-dynamic';

/**
 * The phone registering itself for notifications.
 *
 * The token comes from Expo and identifies one installation, not a person.
 * It is stored against the signed-in account, so signing in on a new phone
 * adds a device and signing out removes one — a parent who hands an old
 * handset to a relative should stop receiving her daughter's results on it.
 *
 * A token is unique across the platform: if it turns up under a different
 * account, that phone changed hands, and the row moves with it rather than
 * delivering to both.
 */
export async function POST(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  let body: { token?: string; platform?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('Expected a JSON body');
  }

  const token = (body.token ?? '').trim();
  if (!token || !token.startsWith('ExponentPushToken')) {
    return badRequest('Not a push token');
  }

  const platform =
    body.platform === 'ios' || body.platform === 'web' ? body.platform : 'android';

  await context.db.raw(
    `INSERT INTO push_devices (school_id, user_id, expo_token, platform, last_seen_at)
     VALUES (:schoolId, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       school_id = VALUES(school_id),
       user_id = VALUES(user_id),
       platform = VALUES(platform),
       is_active = 1,
       last_seen_at = NOW()`,
    [context.session.userId, token, platform],
  );

  return NextResponse.json({ ok: true });
}

/** Signing out on this phone. */
export async function DELETE(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  const token = request.nextUrl.searchParams.get('token');
  if (!token) return badRequest('Which device?');

  await context.db.raw(
    `UPDATE push_devices SET is_active = 0
      WHERE school_id = :schoolId AND user_id = ? AND expo_token = ?`,
    [context.session.userId, token],
  );

  return NextResponse.json({ ok: true });
}

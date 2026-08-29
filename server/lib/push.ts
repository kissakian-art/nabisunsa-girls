/**
 * Push notifications.
 *
 * The proposal sells this as "a direct line to every parent's phone, with no
 * cost per message" — the thing that replaces the SMS bill. So it has to
 * work, and it has to be careful.
 *
 * WHAT A NOTIFICATION MAY SAY
 * ---------------------------
 * Never a mark. A notification appears on a lock screen, which is visible to
 * whoever is holding the phone — a sibling, a boda rider, anyone in the room.
 * "Biology results have been released" is the message; the mark itself is
 * behind the password. This is not a preference, it is the difference
 * between a private result and one read aloud on a taxi.
 *
 * DELIVERY
 * --------
 * Expo's push service, which is what an Expo app receives on. It reaches
 * Android through Firebase Cloud Messaging, so a branded build needs that
 * school's FCM credentials — the one thing Firebase is still used for.
 *
 * Sending never blocks the school. A DoS releasing marks must not wait on an
 * HTTP call to a third party, and must not have the release fail because
 * that call did.
 */

import type { RowDataPacket } from 'mysql2';
import type { TenantDb } from '../db/tenant';

/** Overridable so tests can point at a local endpoint instead of the internet. */
const EXPO_ENDPOINT =
  process.env.EXPO_PUSH_URL || 'https://exp.host/--/api/v2/push/send';

/** Expo accepts up to 100 messages per request. */
const CHUNK = 100;

export interface PushMessage {
  title: string;
  body: string;
  /** Small payload the app uses to decide where to open. Never marks. */
  data?: Record<string, string | number>;
}

interface DeviceRow extends RowDataPacket {
  id: number;
  userId: number;
  expoToken: string;
}

export type NotificationType =
  | 'results'
  | 'announcement'
  | 'commendation'
  | 'fees'
  | 'system';

/**
 * Sends one message to a set of accounts, and records it.
 *
 * The row in `notifications` is written whether or not the push itself
 * succeeds: it is the school's record that a parent was told, and the app
 * reads it to show what was missed while the phone was off.
 */
export async function notifyUsers(
  db: TenantDb,
  userIds: number[],
  message: PushMessage,
  type: NotificationType,
  referenceId?: number,
): Promise<{ recorded: number; pushed: number }> {
  const unique = Array.from(new Set(userIds)).filter((id) => Number.isInteger(id));
  if (unique.length === 0) return { recorded: 0, pushed: 0 };

  for (const userId of unique) {
    await db.insert('notifications', {
      user_id: userId,
      title: message.title,
      body: message.body,
      type,
      reference_id: referenceId ?? null,
      sent_at: new Date(),
    });
  }

  const devices = await db.raw<DeviceRow>(
    `SELECT id, user_id AS userId, expo_token AS expoToken
       FROM push_devices
      WHERE school_id = :schoolId
        AND is_active = 1
        AND user_id IN (${unique.map(() => '?').join(',')})`,
    unique,
  );

  const pushed = await sendToTokens(db, devices, message);
  return { recorded: unique.length, pushed };
}

async function sendToTokens(
  db: TenantDb,
  devices: DeviceRow[],
  message: PushMessage,
): Promise<number> {
  let sent = 0;

  for (let i = 0; i < devices.length; i += CHUNK) {
    const batch = devices.slice(i, i + CHUNK);
    const payload = batch.map((device) => ({
      to: device.expoToken,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      sound: 'default',
      channelId: 'academic',
    }));

    let response: Response;
    try {
      response = await fetch(EXPO_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // The school's work is already done and saved. A push that could not
      // be delivered is worth knowing about, not worth undoing a release.
      console.error('[push] could not reach the push service:', error);
      continue;
    }

    if (!response.ok) {
      console.error(`[push] push service returned ${response.status}`);
      continue;
    }

    let body: { data?: { status: string; details?: { error?: string } }[] };
    try {
      body = await response.json();
    } catch {
      continue;
    }

    // A phone that has uninstalled the app reports back once and then keeps
    // reporting forever unless the token is retired.
    const dead: number[] = [];
    (body.data ?? []).forEach((ticket, index) => {
      if (ticket.status === 'ok') sent += 1;
      else if (ticket.details?.error === 'DeviceNotRegistered') {
        const device = batch[index];
        if (device) dead.push(device.id);
      }
    });

    if (dead.length > 0) {
      await db.raw(
        `UPDATE push_devices SET is_active = 0
          WHERE school_id = :schoolId AND id IN (${dead.map(() => '?').join(',')})`,
        dead,
      );
    }
  }

  return sent;
}

/**
 * The accounts to tell when a class's marks are released.
 *
 * Only families with a child in that class and stream, and only accounts
 * that exist — a student whose family has not activated yet is simply not on
 * the list.
 */
export async function familiesOfClass(
  db: TenantDb,
  classId: number,
  streamId: number | null,
): Promise<number[]> {
  const rows = await db.raw<RowDataPacket & { userId: number }>(
    `SELECT DISTINCT s.user_id AS userId
       FROM students s
      WHERE s.school_id = :schoolId
        AND s.class_id = ?
        AND s.status = 'active'
        AND s.user_id IS NOT NULL
        ${streamId != null ? 'AND s.stream_id = ?' : ''}`,
    streamId != null ? [classId, streamId] : [classId],
  );
  return rows.map((row) => Number(row.userId));
}

/** Every family account at the school, for a school-wide announcement. */
export async function allFamilies(db: TenantDb): Promise<number[]> {
  const rows = await db.raw<RowDataPacket & { id: number }>(
    `SELECT id FROM users
      WHERE school_id = :schoolId AND role = 'student_parent' AND is_active = 1`,
  );
  return rows.map((row) => Number(row.id));
}

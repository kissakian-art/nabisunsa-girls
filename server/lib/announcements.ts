/**
 * Announcements — the school talking to every parent at once.
 *
 * This is the second half of what replaces the SMS bill. A school with 900
 * students currently either prints a circular that reaches the ones who hand
 * it over, or pays per message.
 *
 * An announcement is a draft until it is published, for the same reason a
 * marksheet is: something sent to 900 phones cannot be unsent, so the moment
 * it goes out is a deliberate, separate act.
 */

import type { RowDataPacket } from 'mysql2';
import type { TenantDb } from '../db/tenant';
import { allFamilies, familiesOfClass, notifyUsers } from './push';

export class AnnouncementError extends Error {}

export type Audience = 'all' | 'parents' | 'students' | 'class' | 'stream';

export interface AnnouncementRow extends RowDataPacket {
  id: number;
  title: string;
  body: string;
  audience: Audience;
  classId: number | null;
  streamId: number | null;
  className: string | null;
  streamName: string | null;
  isPinned: number;
  isUrgent: number;
  publishedAt: string | null;
  createdAt: string;
  authorName: string | null;
}

const SELECT = `
  SELECT a.id, a.title, a.body, a.audience,
         a.class_id AS classId, a.stream_id AS streamId,
         c.name AS className, st.name AS streamName,
         a.is_pinned AS isPinned, a.is_urgent AS isUrgent,
         a.published_at AS publishedAt, a.created_at AS createdAt,
         u.display_name AS authorName
    FROM announcements a
    LEFT JOIN classes c  ON c.id  = a.class_id
    LEFT JOIN streams st ON st.id = a.stream_id
    LEFT JOIN users u    ON u.id  = a.created_by
   WHERE a.school_id = :schoolId
`;

/** Everything, drafts included. The office view. */
export async function listAnnouncements(db: TenantDb): Promise<AnnouncementRow[]> {
  return db.raw<AnnouncementRow>(
    `${SELECT} ORDER BY a.is_pinned DESC, COALESCE(a.published_at, a.created_at) DESC LIMIT 50`,
  );
}

export async function createAnnouncement(
  db: TenantDb,
  input: {
    title: string;
    body: string;
    audience: Audience;
    classId?: number | null;
    streamId?: number | null;
    isPinned?: boolean;
    isUrgent?: boolean;
    authorId: number;
  },
): Promise<number> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new AnnouncementError('An announcement needs a title');
  if (!body) throw new AnnouncementError('An announcement needs something to say');
  if (title.length > 200) throw new AnnouncementError('Please keep the title under 200 characters');

  if ((input.audience === 'class' || input.audience === 'stream') && !input.classId) {
    throw new AnnouncementError('Choose the class this is for');
  }
  if (input.audience === 'stream' && !input.streamId) {
    throw new AnnouncementError('Choose the stream this is for');
  }

  return db.insert('announcements', {
    title,
    body,
    audience: input.audience,
    class_id: input.classId ?? null,
    stream_id: input.audience === 'stream' ? input.streamId ?? null : null,
    is_pinned: input.isPinned ? 1 : 0,
    is_urgent: input.isUrgent ? 1 : 0,
    created_by: input.authorId,
    published_at: null,
  });
}

/**
 * Sends it.
 *
 * Publishing is what puts it on 900 phones, so it happens once: an
 * announcement already published is refused rather than sent again.
 */
export async function publishAnnouncement(
  db: TenantDb,
  announcementId: number,
): Promise<{ notified: number }> {
  const announcement = await db.selectOne<AnnouncementRow>('announcements', {
    where: { id: announcementId },
  });
  if (!announcement) throw new AnnouncementError('No such announcement');
  if (announcement.published_at) {
    throw new AnnouncementError('That announcement has already been sent');
  }

  await db.update('announcements', { published_at: new Date() }, { id: announcementId });

  const audience = announcement.audience as Audience;
  const recipients =
    audience === 'class' || audience === 'stream'
      ? await familiesOfClass(
          db,
          Number(announcement.class_id),
          audience === 'stream' ? Number(announcement.stream_id) : null,
        )
      : await allFamilies(db);

  const { recorded } = await notifyUsers(
    db,
    recipients,
    {
      title: announcement.title,
      // A phone notification is one line on a lock screen. The full text is
      // in the app; sending a paragraph to the notification tray truncates
      // it somewhere arbitrary and reads worse than a summary.
      body: summarise(announcement.body),
      data: { screen: 'announcements', announcementId },
    },
    'announcement',
    announcementId,
  );

  return { notified: recorded };
}

/** First sentence, or the first 120 characters, whichever comes first. */
export function summarise(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  const sentence = flat.match(/^.*?[.!?](\s|$)/)?.[0]?.trim();
  if (sentence && sentence.length <= 120) return sentence;
  return flat.length <= 120 ? flat : `${flat.slice(0, 117).trimEnd()}…`;
}

/**
 * What a family may see.
 *
 * Published only, and only what is addressed to them: a message to S4 Red
 * does not go to a parent whose daughter is in S2. `students` is included
 * because a student uses the same account as her parent.
 */
export async function announcementsForFamily(
  db: TenantDb,
  userId: number,
): Promise<AnnouncementRow[]> {
  return db.raw<AnnouncementRow>(
    `${SELECT}
       AND a.published_at IS NOT NULL
       AND (
         a.audience IN ('all','parents','students')
         OR (a.audience = 'class' AND a.class_id IN (
               SELECT s.class_id FROM students s
                WHERE s.school_id = :schoolId AND s.user_id = ? AND s.status = 'active'))
         OR (a.audience = 'stream' AND a.stream_id IN (
               SELECT s.stream_id FROM students s
                WHERE s.school_id = :schoolId AND s.user_id = ? AND s.status = 'active'))
       )
     ORDER BY a.is_pinned DESC, a.published_at DESC
     LIMIT 30`,
    [userId, userId],
  );
}

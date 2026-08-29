'use server';

import { revalidatePath } from 'next/cache';
import { requireSession, canRelease } from '../../lib/auth';
import {
  AnnouncementError,
  createAnnouncement,
  publishAnnouncement,
  type Audience,
} from '../../lib/announcements';

/**
 * Announcements go to every parent at once, so writing and sending them is
 * the Director of Studies' or an administrator's decision — the same
 * authority as releasing marks, for the same reason.
 */
function requirePublisher() {
  const context = requireSession();
  if (!canRelease(context.session.role)) {
    throw new AnnouncementError(
      'Only the Director of Studies or an administrator can send announcements',
    );
  }
  return context;
}

export interface AnnouncementActionResult {
  ok?: string;
  error?: string;
}

const fail = (error: unknown) => ({
  error: error instanceof Error ? error.message : 'Something went wrong',
});

export async function createAnnouncementAction(
  _prev: unknown,
  formData: FormData,
): Promise<AnnouncementActionResult> {
  try {
    const { db, session } = requirePublisher();
    const audience = String(formData.get('audience') ?? 'all') as Audience;
    const classRaw = String(formData.get('classId') ?? '');
    const streamRaw = String(formData.get('streamId') ?? '');

    await createAnnouncement(db, {
      title: String(formData.get('title') ?? ''),
      body: String(formData.get('body') ?? ''),
      audience,
      classId: classRaw ? Number(classRaw) : null,
      streamId: streamRaw ? Number(streamRaw) : null,
      isPinned: formData.get('isPinned') === 'on',
      authorId: session.userId,
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/announcements');
  return { ok: 'Saved as a draft. Read it once more, then send it.' };
}

export async function publishAnnouncementAction(
  _prev: unknown,
  formData: FormData,
): Promise<AnnouncementActionResult> {
  let notified = 0;
  try {
    const { db } = requirePublisher();
    const outcome = await publishAnnouncement(db, Number(formData.get('id')));
    notified = outcome.notified;
  } catch (error) {
    return fail(error);
  }
  revalidatePath('/announcements');
  return {
    ok:
      notified === 0
        ? 'Sent. No families have the app yet, so nobody was notified.'
        : `Sent to ${notified} family account(s).`,
  };
}

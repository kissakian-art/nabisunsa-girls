import { NextRequest, NextResponse } from 'next/server';
import { apiSession, isServable, schoolState, suspended, unauthorized } from '../../../lib/api';
import { announcementsForFamily } from '../../../lib/announcements';

export const dynamic = 'force-dynamic';

/**
 * What the school has told this family.
 *
 * Published announcements only, and only those addressed to them — a message
 * to S4 Red does not reach a parent whose daughter is in S2.
 */
export async function GET(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  const state = await schoolState(context);
  if (!isServable(state)) return suspended(state.suspendedReason);

  const rows = await announcementsForFamily(context.db, context.session.userId);

  return NextResponse.json({
    announcements: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      isPinned: !!row.isPinned,
      isUrgent: !!row.isUrgent,
      publishedAt: row.publishedAt,
      audience: row.audience,
      className: row.className,
      streamName: row.streamName,
    })),
  });
}

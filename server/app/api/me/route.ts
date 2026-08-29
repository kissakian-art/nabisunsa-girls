import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { apiSession, childrenOf, schoolState, unauthorized } from '../../../lib/api';

export const dynamic = 'force-dynamic';

interface SchoolRow extends RowDataPacket {
  name: string;
  motto: string | null;
  logoUrl: string | null;
  brandPrimary: string | null;
}

/**
 * Who is signed in, which school, and which children this account may see.
 *
 * The app calls this on launch: it drives the school branding as well as the
 * child picker, so a family with two daughters chooses between them.
 *
 * This is the one endpoint a suspended school still gets an answer from. The
 * app cannot tell a parent why the portal has gone quiet unless something
 * tells it, and a silent app becomes a complaint to the head teacher rather
 * than a renewal.
 */
export async function GET(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  const [school] = await context.db.raw<SchoolRow>(
    `SELECT name, motto, logo_url AS logoUrl, brand_primary AS brandPrimary
       FROM schools WHERE id = :schoolId`,
  );
  const state = await schoolState(context);

  return NextResponse.json({
    user: { name: context.session.name },
    school: { ...school, status: state.status, suspendedReason: state.suspendedReason },
    children: await childrenOf(context),
  });
}

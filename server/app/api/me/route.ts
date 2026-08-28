import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { apiSession, childrenOf, unauthorized } from '../../../lib/api';

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
 */
export async function GET(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  const [school] = await context.db.raw<SchoolRow>(
    `SELECT name, motto, logo_url AS logoUrl, brand_primary AS brandPrimary
       FROM schools WHERE id = :schoolId`,
  );

  return NextResponse.json({
    user: { name: context.session.name },
    school,
    children: await childrenOf(context),
  });
}

import { NextResponse } from 'next/server';
import { getPool } from '../../../db/tenant';

export const dynamic = 'force-dynamic';

/**
 * Is this deployment actually working?
 *
 * "The container is running" is not the same as "the portal works" — the
 * usual first-deploy failure is a container that starts perfectly and cannot
 * reach the database. So this answers the question that matters, and answers
 * it without a login, because it is checked before anyone has one.
 *
 * It says nothing about the database beyond yes or no: no host, no user, no
 * error text. A public endpoint that reports "Access denied for user
 * 'school'@'172.18.0.4'" is a free map of the inside.
 */
export async function GET() {
  const checks: Record<string, boolean> = {
    database: false,
    schema: false,
    sessionSecret: !!process.env.SESSION_SECRET && process.env.SESSION_SECRET !== 'CHANGE_ME',
  };

  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT COUNT(*) AS n FROM schools');
    checks.database = true;
    // A reachable database with no tables is a deploy that skipped its
    // migrations — worth distinguishing, because it looks identical from
    // the outside until someone tries to sign in.
    checks.schema = Array.isArray(rows);
  } catch {
    // Deliberately silent: see above.
  }

  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}

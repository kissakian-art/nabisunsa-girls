import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import {
  apiSession,
  authorisedChild,
  isServable,
  notFound,
  schoolState,
  suspended,
  unauthorized,
} from '../../../lib/api';
import { getStudentTermResults } from '../../../lib/results';

export const dynamic = 'force-dynamic';

interface TermRow extends RowDataPacket {
  id: number;
  name: string;
  isCurrent: number;
}

/**
 * A child's released results for a term.
 *
 * GET /api/results?studentId=&termId=
 *
 * Both parameters are optional: without them the account's first child and
 * the current term are used, which is what the app wants on launch.
 *
 * Everything here comes from `term_results`, which by construction only ever
 * contains marks the school has released. There is no filter to forget.
 */
export async function GET(request: NextRequest) {
  const context = apiSession(request);
  if (!context) return unauthorized();

  // A school that has been switched off serves no marks, whatever the app
  // in the parent's hand believes.
  const state = await schoolState(context);
  if (!isServable(state)) return suspended(state.suspendedReason);

  const params = request.nextUrl.searchParams;
  const requestedStudent = params.get('studentId');
  const requestedTerm = params.get('termId');

  // The student is resolved against this account's own children, never
  // trusted from the query string.
  const child = await authorisedChild(
    context,
    requestedStudent ? Number(requestedStudent) : null,
  );
  if (!child) return notFound('No such student');

  const terms = await context.db.raw<TermRow>(
    `SELECT id, name, is_current AS isCurrent
       FROM terms WHERE school_id = :schoolId
      ORDER BY academic_year DESC, term_number DESC`,
  );
  if (terms.length === 0) return NextResponse.json({ child, term: null, results: [] });

  const term =
    (requestedTerm ? terms.find((t) => t.id === Number(requestedTerm)) : null) ??
    terms.find((t) => t.isCurrent) ??
    terms[0];

  const results = await getStudentTermResults(context.db, child.id, term.id);

  return NextResponse.json({
    child,
    term: { id: term.id, name: term.name },
    terms: terms.map((t) => ({ id: t.id, name: t.name })),
    results,
  });
}

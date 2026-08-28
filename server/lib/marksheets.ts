/**
 * Marksheet queries and state changes.
 *
 * Every function takes a TenantDb, so nothing here can reach outside the
 * signed-in user's school. The workflow rules live in domain/marksheet.ts
 * and are applied here before any write.
 */

import type { RowDataPacket } from 'mysql2';
import type { TenantDb } from '../db/tenant';
import {
  evaluateTransition,
  MarksheetAction,
  MarksheetState,
  MarksheetStatus,
  ActorRole,
} from '../domain/marksheet';
import { recomputeTermResults } from './results';

export interface MarksheetSummary {
  id: number;
  status: MarksheetStatus;
  termId: number;
  subjectId: number;
  className: string;
  streamName: string | null;
  subjectName: string;
  assessmentName: string;
  termName: string;
  expectedStudents: number;
  recordedMarks: number;
  enteredBy: number | null;
  enteredByName: string | null;
  verifiedBy: number | null;
  publishedAt: string | null;
}

interface SummaryRow extends RowDataPacket, MarksheetSummary {}

const SUMMARY_SQL = `
  SELECT ms.id,
         ms.status,
         ms.term_id    AS termId,
         ms.subject_id AS subjectId,
         c.name  AS className,
         st.name AS streamName,
         sub.name AS subjectName,
         a.name  AS assessmentName,
         t.name  AS termName,
         ms.entered_by  AS enteredBy,
         eu.display_name AS enteredByName,
         ms.verified_by AS verifiedBy,
         ms.published_at AS publishedAt,
         (SELECT COUNT(*) FROM students s
           WHERE s.school_id = ms.school_id
             AND s.class_id  = ms.class_id
             AND (ms.stream_id IS NULL OR s.stream_id = ms.stream_id)
             AND s.status = 'active') AS expectedStudents,
         (SELECT COUNT(*) FROM marks m WHERE m.marksheet_id = ms.id) AS recordedMarks
    FROM marksheets ms
    JOIN classes  c   ON c.id   = ms.class_id
    JOIN subjects sub ON sub.id = ms.subject_id
    JOIN assessments a ON a.id  = ms.assessment_id
    JOIN terms    t   ON t.id   = ms.term_id
    LEFT JOIN streams st ON st.id = ms.stream_id
    LEFT JOIN users   eu ON eu.id = ms.entered_by
   WHERE ms.school_id = :schoolId
`;

export async function listMarksheets(
  db: TenantDb,
  filters: { termId?: number; status?: MarksheetStatus } = {},
): Promise<MarksheetSummary[]> {
  let sql = SUMMARY_SQL;
  const params: unknown[] = [];
  if (filters.termId) {
    sql += ' AND ms.term_id = ?';
    params.push(filters.termId);
  }
  if (filters.status) {
    sql += ' AND ms.status = ?';
    params.push(filters.status);
  }
  sql += ' ORDER BY c.sort_order, c.code, st.name, sub.name';
  return db.raw<SummaryRow>(sql, params);
}

export async function getMarksheet(
  db: TenantDb,
  id: number,
): Promise<MarksheetSummary | null> {
  const rows = await db.raw<SummaryRow>(`${SUMMARY_SQL} AND ms.id = ?`, [id]);
  return rows[0] ?? null;
}

export interface StudentMarkRow {
  studentId: number;
  registrationNo: string;
  firstName: string;
  lastName: string;
  score: number | null;
  isAbsent: boolean;
}

interface StudentRow extends RowDataPacket, StudentMarkRow {}

/**
 * The class list for a marksheet, with any marks already recorded.
 *
 * Driven from `students` rather than `marks` so a student who has not been
 * given a mark yet still appears — otherwise they would silently vanish from
 * the entry screen and be missed.
 */
export async function getMarksheetStudents(
  db: TenantDb,
  marksheetId: number,
): Promise<StudentMarkRow[]> {
  return db.raw<StudentRow>(
    `SELECT s.id AS studentId,
            s.registration_no AS registrationNo,
            s.first_name AS firstName,
            s.last_name  AS lastName,
            m.score,
            COALESCE(m.is_absent, 0) AS isAbsent
       FROM marksheets ms
       JOIN students s
         ON s.school_id = ms.school_id
        AND s.class_id  = ms.class_id
        AND (ms.stream_id IS NULL OR s.stream_id = ms.stream_id)
        AND s.status = 'active'
       LEFT JOIN marks m
         ON m.marksheet_id = ms.id AND m.student_id = s.id
      WHERE ms.school_id = :schoolId AND ms.id = ?
      ORDER BY s.last_name, s.first_name`,
    [marksheetId],
  );
}

export interface MarkInput {
  studentId: number;
  score: number | null;
  isAbsent: boolean;
}

export class MarksheetError extends Error {}

/**
 * Saves entered marks.
 *
 * Refused once a sheet has been verified or published: correcting a released
 * mark must go through withdraw-and-reopen, so the change is deliberate and
 * leaves a trail, rather than quietly editing what a parent already saw.
 */
export async function saveMarks(
  db: TenantDb,
  marksheetId: number,
  marks: MarkInput[],
): Promise<void> {
  const sheet = await getMarksheet(db, marksheetId);
  if (!sheet) throw new MarksheetError('No such marksheet');
  if (sheet.status !== 'draft') {
    throw new MarksheetError(
      `This marksheet is ${sheet.status} and can no longer be edited. Reopen it first.`,
    );
  }

  const roster = await getMarksheetStudents(db, marksheetId);
  const allowed = new Set(roster.map((r) => r.studentId));

  for (const mark of marks) {
    // A student id that is not on this class list has no business here,
    // whether that is a stale form or someone editing the request.
    if (!allowed.has(mark.studentId)) {
      throw new MarksheetError(`Student ${mark.studentId} is not on this class list`);
    }
    if (mark.score != null && (mark.score < 0 || mark.score > 100)) {
      throw new MarksheetError(`Score ${mark.score} is outside 0-100`);
    }
  }

  await db.transaction(async (tx) => {
    for (const mark of marks) {
      const existing = await tx.selectOne<RowDataPacket & { id: number }>('marks', {
        where: { marksheet_id: marksheetId, student_id: mark.studentId },
      });

      // A blank box that is not ticked absent means "not marked yet", so it
      // must leave no row behind. Storing it as a NULL score would count
      // towards the recorded total and let an incomplete sheet be submitted.
      if (mark.score == null && !mark.isAbsent) {
        if (existing) await tx.delete('marks', { id: existing.id });
        continue;
      }

      const score = mark.isAbsent ? null : mark.score;
      if (existing) {
        await tx.update(
          'marks',
          { score, is_absent: mark.isAbsent ? 1 : 0 },
          { id: existing.id },
        );
      } else {
        await tx.insert('marks', {
          marksheet_id: marksheetId,
          student_id: mark.studentId,
          score,
          is_absent: mark.isAbsent ? 1 : 0,
        });
      }
    }
  });
}

/**
 * Moves a marksheet along, applying the workflow rules first.
 *
 * Returns the refusal reason rather than throwing for a disallowed
 * transition: those are expected outcomes the DoS office needs to read, not
 * exceptional conditions.
 */
export async function transition(
  db: TenantDb,
  marksheetId: number,
  action: MarksheetAction,
  actor: { id: number; role: ActorRole },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const sheet = await getMarksheet(db, marksheetId);
  if (!sheet) return { ok: false, reason: 'No such marksheet' };

  const state: MarksheetState = {
    status: sheet.status,
    expectedStudents: Number(sheet.expectedStudents),
    recordedMarks: Number(sheet.recordedMarks),
    enteredBy: sheet.enteredBy,
    verifiedBy: sheet.verifiedBy,
  };

  const decision = evaluateTransition(state, {
    action,
    actorId: actor.id,
    actorRole: actor.role,
  });
  if (!decision.allowed) return { ok: false, reason: decision.reason ?? 'Not allowed' };

  const values: Record<string, unknown> = { status: decision.nextStatus };
  if (action === 'enter') values.entered_by = actor.id;
  if (action === 'verify') values.verified_by = actor.id;
  if (action === 'publish') {
    values.published_by = actor.id;
    values.published_at = new Date();
  }
  if (action === 'unpublish') {
    values.published_at = null;
    values.published_by = null;
  }
  if (action === 'reopen') {
    // Clear the sign-offs: a reopened sheet has to be checked again, or the
    // four-eyes rule could be satisfied by a review of different numbers.
    values.verified_by = null;
    values.published_at = null;
    values.published_by = null;
  }

  await db.update('marksheets', values, { id: marksheetId });

  await db.insert('audit_log', {
    user_id: actor.id,
    action: `marksheet.${action}`,
    entity: 'marksheet',
    entity_id: marksheetId,
    detail: JSON.stringify({ from: sheet.status, to: decision.nextStatus }),
  });

  // Releasing or withdrawing changes what a parent may see, so the computed
  // results have to follow. Recomputing on withdrawal matters as much as on
  // release: pulling a paper back must also pull back the final mark it fed.
  if (action === 'publish' || action === 'unpublish') {
    const termId = await termIdFor(db, marksheetId);
    if (termId) {
      try {
        await recomputeTermResults(db, termId, sheet.subjectId);
      } catch (error) {
        // The marksheet has already moved; failing the whole action here
        // would leave the office unable to release. Surface it instead.
        return {
          ok: false,
          reason:
            'The marksheet was released, but results could not be recalculated: ' +
            (error instanceof Error ? error.message : String(error)),
        };
      }
    }
  }

  return { ok: true };
}

async function termIdFor(db: TenantDb, marksheetId: number): Promise<number | null> {
  const sheet = await db.selectOne<RowDataPacket & { term_id: number }>('marksheets', {
    where: { id: marksheetId },
    columns: ['term_id'],
  });
  return sheet ? Number(sheet.term_id) : null;
}

export interface Term extends RowDataPacket {
  id: number;
  name: string;
  is_current: number;
}

export async function listTerms(db: TenantDb): Promise<Term[]> {
  return db.select<Term>('terms', { orderBy: 'academic_year DESC, term_number DESC' });
}

export async function currentTerm(db: TenantDb): Promise<Term | null> {
  const current = await db.selectOne<Term>('terms', { where: { is_current: 1 } });
  if (current) return current;
  const all = await listTerms(db);
  return all[0] ?? null;
}

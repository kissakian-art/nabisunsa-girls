/**
 * Report cards.
 *
 * A report card is the school's own output — printed, signed and handed to a
 * parent. It reads only from `term_results`, so it can never show a mark the
 * school has not released.
 *
 * Overall position is computed here rather than stored, because it depends
 * on which subjects a student sat and would go stale the moment another
 * subject is released.
 */

import type { RowDataPacket } from 'mysql2';
import type { TenantDb } from '../db/tenant';

export interface SubjectLine {
  subjectId: number;
  subjectName: string;
  caScore: number | null;
  eotScore: number | null;
  finalScore: number | null;
  grade: string | null;
  points: number | null;
  position: number | null;
}

export interface ReportCard {
  studentId: number;
  firstName: string;
  lastName: string;
  registrationNo: string;
  className: string;
  streamName: string | null;
  subjects: SubjectLine[];
  /** Mean of the released final marks, or null when nothing is released. */
  average: number | null;
  totalMarks: number | null;
  /** Sum of grade points across the subjects shown. */
  totalPoints: number | null;
  subjectsCounted: number;
  /** Rank by average within the class and stream. */
  overallPosition: number | null;
  /** How many students that position is out of. */
  groupSize: number;
}

export interface ReportContext {
  school: { name: string; motto: string | null; logoUrl: string | null };
  term: { id: number; name: string };
  className: string;
  streamName: string | null;
}

interface StudentRow extends RowDataPacket {
  studentId: number;
  firstName: string;
  lastName: string;
  registrationNo: string;
  className: string;
  streamName: string | null;
}

interface ResultRow extends RowDataPacket {
  studentId: number;
  subjectId: number;
  subjectName: string;
  caScore: number | null;
  eotScore: number | null;
  finalScore: number | null;
  grade: string | null;
  points: number | null;
  position: number | null;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Builds report cards for a whole class or stream.
 *
 * Every student on the roll is returned, including those with nothing
 * released yet: a report card missing from a stack of forty is far worse
 * than one that says plainly that no results are published.
 */
export async function buildClassReportCards(
  db: TenantDb,
  termId: number,
  classId: number,
  streamId: number | null,
): Promise<ReportCard[]> {
  const students = await db.raw<StudentRow>(
    `SELECT s.id AS studentId,
            s.first_name AS firstName,
            s.last_name  AS lastName,
            s.registration_no AS registrationNo,
            c.name  AS className,
            st.name AS streamName
       FROM students s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN streams st ON st.id = s.stream_id
      WHERE s.school_id = :schoolId
        AND s.class_id = ?
        AND (? IS NULL OR s.stream_id = ?)
        AND s.status = 'active'
      ORDER BY s.last_name, s.first_name`,
    [classId, streamId, streamId],
  );
  if (students.length === 0) return [];

  const ids = students.map((s) => s.studentId);
  const results = await db.raw<ResultRow>(
    `SELECT tr.student_id AS studentId,
            tr.subject_id AS subjectId,
            sub.name      AS subjectName,
            tr.ca_score   AS caScore,
            tr.eot_score  AS eotScore,
            tr.final_score AS finalScore,
            tr.grade,
            tr.points,
            tr.subject_position AS position
       FROM term_results tr
       JOIN subjects sub ON sub.id = tr.subject_id
      WHERE tr.school_id = :schoolId
        AND tr.term_id = ?
        AND tr.student_id IN (${ids.map(() => '?').join(',')})
      ORDER BY sub.name`,
    [termId, ...ids],
  );

  const bySubjectStudent = new Map<number, SubjectLine[]>();
  for (const row of results) {
    if (!bySubjectStudent.has(row.studentId)) bySubjectStudent.set(row.studentId, []);
    bySubjectStudent.get(row.studentId)!.push({
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      caScore: row.caScore == null ? null : Number(row.caScore),
      eotScore: row.eotScore == null ? null : Number(row.eotScore),
      finalScore: row.finalScore == null ? null : Number(row.finalScore),
      grade: row.grade,
      points: row.points == null ? null : Number(row.points),
      position: row.position == null ? null : Number(row.position),
    });
  }

  const cards: ReportCard[] = students.map((student) => {
    const subjects = bySubjectStudent.get(student.studentId) ?? [];
    const scored = subjects.filter((s) => s.finalScore != null);

    const totalMarks = scored.length
      ? round2(scored.reduce((sum, s) => sum + (s.finalScore as number), 0))
      : null;
    const totalPoints = scored.length
      ? round2(scored.reduce((sum, s) => sum + (s.points ?? 0), 0))
      : null;

    return {
      studentId: student.studentId,
      firstName: student.firstName,
      lastName: student.lastName,
      registrationNo: student.registrationNo,
      className: student.className,
      streamName: student.streamName,
      subjects,
      average: totalMarks == null ? null : round2(totalMarks / scored.length),
      totalMarks,
      totalPoints,
      subjectsCounted: scored.length,
      overallPosition: null,
      groupSize: 0,
    };
  });

  // Overall position: ranked by average, ties sharing a position and the
  // next distinct average skipping ahead. A student with nothing released
  // has no position rather than coming last.
  const ranked = cards
    .filter((card) => card.average != null)
    .sort((a, b) => (b.average as number) - (a.average as number));

  let lastAverage: number | null = null;
  let lastPosition = 0;
  ranked.forEach((card, index) => {
    const position = card.average === lastAverage ? lastPosition : index + 1;
    card.overallPosition = position;
    lastAverage = card.average;
    lastPosition = position;
  });

  for (const card of cards) card.groupSize = ranked.length;
  return cards;
}

/** One student's card, ranked against their own class. */
export async function buildStudentReportCard(
  db: TenantDb,
  termId: number,
  studentId: number,
): Promise<{ card: ReportCard; context: ReportContext } | null> {
  const [student] = await db.raw<RowDataPacket & {
    classId: number; streamId: number | null;
  }>(
    `SELECT class_id AS classId, stream_id AS streamId
       FROM students WHERE school_id = :schoolId AND id = ?`,
    [studentId],
  );
  if (!student) return null;

  const cards = await buildClassReportCards(
    db, termId, Number(student.classId),
    student.streamId == null ? null : Number(student.streamId),
  );
  const card = cards.find((c) => c.studentId === studentId);
  if (!card) return null;

  const context = await reportContext(db, termId, card.className, card.streamName);
  return { card, context };
}

export async function reportContext(
  db: TenantDb,
  termId: number,
  className: string,
  streamName: string | null,
): Promise<ReportContext> {
  const [school] = await db.raw<RowDataPacket & {
    name: string; motto: string | null; logoUrl: string | null;
  }>(
    'SELECT name, motto, logo_url AS logoUrl FROM schools WHERE id = :schoolId',
  );
  const [term] = await db.raw<RowDataPacket & { id: number; name: string }>(
    'SELECT id, name FROM terms WHERE school_id = :schoolId AND id = ?',
    [termId],
  );
  return {
    school: { name: school?.name ?? '', motto: school?.motto ?? null, logoUrl: school?.logoUrl ?? null },
    term: { id: term?.id ?? termId, name: term?.name ?? '' },
    className,
    streamName,
  };
}

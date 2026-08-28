/**
 * Turning released marksheets into term results.
 *
 * This is the link between what the DoS office types and what a parent
 * eventually sees. It runs when a marksheet is released or withdrawn, and
 * writes `term_results`: the weighted final mark, the grade, and the
 * student's position in that subject.
 *
 * Two rules matter more than the arithmetic:
 *
 *  1. ONLY PUBLISHED MARKSHEETS COUNT. A mark the school has not released
 *     must never reach a computed result, because that result is what the
 *     mobile app shows a parent. Draft and verified marks are invisible here
 *     by construction, not by a filter someone might forget.
 *
 *  2. A RESULT IS ONLY WRITTEN WHEN IT IS REAL. If the end-of-term paper is
 *     not released yet, there is no final mark and no position — the row is
 *     removed rather than left holding a stale or half-computed figure.
 *
 * The arithmetic itself lives in domain/marks.ts and is tested there.
 */

import type { RowDataPacket } from 'mysql2';
import type { TenantDb } from '../db/tenant';
import {
  computeSubjectResult,
  rankResults,
  GradingConfig,
  GradingScaleEntry,
  SubjectResult,
} from '../domain/marks';

interface ConfigRow extends RowDataPacket {
  ca_weight: number;
  eot_weight: number;
  ca_best_of: number | null;
}

interface ScaleRow extends RowDataPacket, GradingScaleEntry {}

/** Reads the school's grading rules. Nothing about them is hardcoded. */
export async function loadGradingConfig(db: TenantDb): Promise<GradingConfig> {
  const config = await db.selectOne<ConfigRow>('school_grading_config');
  if (!config) {
    throw new Error('This school has no grading configuration set up');
  }
  const scale = await db.raw<ScaleRow>(
    `SELECT grade, min_score AS minScore, label, points
       FROM grading_scale
      WHERE school_id = :schoolId
      ORDER BY min_score DESC`,
  );
  return {
    caWeight: Number(config.ca_weight),
    eotWeight: Number(config.eot_weight),
    caBestOf: config.ca_best_of == null ? null : Number(config.ca_best_of),
    scale: scale.map((row) => ({
      grade: row.grade,
      minScore: Number(row.minScore),
      label: row.label,
      points: row.points == null ? null : Number(row.points),
    })),
  };
}

interface ReleasedMarkRow extends RowDataPacket {
  studentId: number;
  classId: number;
  streamId: number | null;
  subjectId: number;
  isFinal: number;
  category: 'coursework' | 'exam';
  score: number | null;
  isAbsent: number;
}

/**
 * Recomputes and stores results for one term, optionally narrowed to one
 * subject.
 *
 * Returns the number of result rows written, which the caller can log.
 */
export async function recomputeTermResults(
  db: TenantDb,
  termId: number,
  subjectId?: number,
): Promise<number> {
  const config = await loadGradingConfig(db);

  // Every released mark for this term. The published filter is the whole
  // point: unreleased marks must not influence what a parent sees.
  const rows = await db.raw<ReleasedMarkRow>(
    `SELECT m.student_id AS studentId,
            s.class_id   AS classId,
            s.stream_id  AS streamId,
            ms.subject_id AS subjectId,
            a.is_final   AS isFinal,
            a.category   AS category,
            m.score,
            m.is_absent  AS isAbsent
       FROM marks m
       JOIN marksheets ms ON ms.id = m.marksheet_id
       JOIN assessments a ON a.id = ms.assessment_id
       JOIN students   s  ON s.id = m.student_id
      WHERE m.school_id = :schoolId
        AND ms.term_id = ?
        AND ms.status = 'published'
        ${subjectId ? 'AND ms.subject_id = ?' : ''}`,
    subjectId ? [termId, subjectId] : [termId],
  );

  // Group by subject, then by student.
  type Bucket = {
    classId: number;
    streamId: number | null;
    coursework: (number | null)[];
    finalExam: number | null;
  };
  const bySubject = new Map<number, Map<number, Bucket>>();

  for (const row of rows) {
    if (!bySubject.has(row.subjectId)) bySubject.set(row.subjectId, new Map());
    const students = bySubject.get(row.subjectId)!;
    if (!students.has(row.studentId)) {
      students.set(row.studentId, {
        classId: row.classId,
        streamId: row.streamId,
        coursework: [],
        finalExam: null,
      });
    }
    const bucket = students.get(row.studentId)!;
    // An absence is not a zero: it is simply not a score. domain/marks.ts
    // excludes nulls from the coursework average for the same reason.
    const score = row.isAbsent ? null : row.score == null ? null : Number(row.score);

    if (row.isFinal) {
      bucket.finalExam = score;
    } else if (row.category === 'coursework') {
      bucket.coursework.push(score);
    }
    // Other exams (Beginning of Term, Mid Term) are reported to parents
    // elsewhere but deliberately do not feed the final mark.
  }

  let written = 0;
  // Everything this run legitimately produced. Anything in scope that is not
  // in here is stale and must go — see the cleanup below.
  const kept = new Set<string>();

  for (const [subject, students] of bySubject) {
    // Rank within a class and stream, not across the whole school: a
    // position only means something against the students sat in the room.
    const byGroup = new Map<string, { studentId: number; result: SubjectResult }[]>();

    for (const [studentId, bucket] of students) {
      const result = computeSubjectResult(
        {
          studentId,
          subjectId: subject,
          coursework: bucket.coursework,
          endOfTerm: bucket.finalExam,
        },
        config,
      );
      const key = `${bucket.classId}:${bucket.streamId ?? 0}`;
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push({ studentId, result });
    }

    for (const group of byGroup.values()) {
      const ranked = rankResults(group.map((g) => g.result));

      for (const result of ranked) {
        const existing = await db.selectOne<RowDataPacket & { id: number }>('term_results', {
          where: { term_id: termId, student_id: result.studentId, subject_id: subject },
        });

        // No final mark means the end-of-term paper is not out yet. Removing
        // the row is deliberate: a stale figure from a previous computation
        // would be worse than nothing, because a parent would believe it.
        if (result.finalScore == null) {
          if (existing) await db.delete('term_results', { id: existing.id });
          continue;
        }

        const values = {
          ca_score: result.caScore,
          eot_score: result.eotScore,
          final_score: result.finalScore,
          grade: result.grade,
          points: result.points,
          subject_position: result.position,
          computed_at: new Date(),
        };

        if (existing) {
          await db.update('term_results', values, { id: existing.id });
        } else {
          await db.insert('term_results', {
            term_id: termId,
            student_id: result.studentId,
            subject_id: subject,
            ...values,
          });
        }
        kept.add(`${result.studentId}:${subject}`);
        written += 1;
      }
    }
  }

  // Remove results that no longer have released marks behind them.
  //
  // The loop above only visits subjects that still have published marks, so
  // withdrawing a subject's LAST released marksheet would otherwise leave its
  // rows untouched and a parent would go on seeing a withdrawn subject. This
  // is the case the per-student "no final score" branch cannot reach, because
  // the subject never enters the loop at all.
  const scoped = await db.raw<RowDataPacket & { id: number; studentId: number; subjectId: number }>(
    `SELECT id, student_id AS studentId, subject_id AS subjectId
       FROM term_results
      WHERE school_id = :schoolId
        AND term_id = ?
        ${subjectId ? 'AND subject_id = ?' : ''}`,
    subjectId ? [termId, subjectId] : [termId],
  );
  for (const row of scoped) {
    if (!kept.has(`${row.studentId}:${row.subjectId}`)) {
      await db.delete('term_results', { id: row.id });
    }
  }

  return written;
}

export interface StudentTermResult {
  subjectId: number;
  subjectName: string;
  caScore: number | null;
  eotScore: number | null;
  finalScore: number | null;
  grade: string | null;
  points: number | null;
  position: number | null;
  groupSize: number;
}

interface StudentResultRow extends RowDataPacket, StudentTermResult {}

/**
 * One student's released results for a term — what a report card prints and
 * what the mobile app shows a parent.
 */
export async function getStudentTermResults(
  db: TenantDb,
  studentId: number,
  termId: number,
): Promise<StudentTermResult[]> {
  return db.raw<StudentResultRow>(
    `SELECT tr.subject_id AS subjectId,
            sub.name      AS subjectName,
            tr.ca_score   AS caScore,
            tr.eot_score  AS eotScore,
            tr.final_score AS finalScore,
            tr.grade,
            tr.points,
            tr.subject_position AS position,
            (SELECT COUNT(*) FROM term_results peer
               JOIN students ps ON ps.id = peer.student_id
              WHERE peer.school_id = tr.school_id
                AND peer.term_id = tr.term_id
                AND peer.subject_id = tr.subject_id
                AND ps.class_id = s.class_id
                AND (ps.stream_id <=> s.stream_id)) AS groupSize
       FROM term_results tr
       JOIN subjects sub ON sub.id = tr.subject_id
       JOIN students s   ON s.id = tr.student_id
      WHERE tr.school_id = :schoolId
        AND tr.student_id = ?
        AND tr.term_id = ?
      ORDER BY sub.name`,
    [studentId, termId],
  );
}

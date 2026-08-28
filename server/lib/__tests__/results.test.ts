/**
 * Term result computation, against a real MySQL server.
 *
 * The guarantee under test is the one the proposal makes in writing: a mark
 * the school has not released must never reach a parent. Here that means it
 * must never reach `term_results`, because that table is what the report
 * card prints and what the mobile app reads.
 *
 *   TEST_DATABASE_URL='mysql://root@127.0.0.1:3306/midway_results_test' \
 *     npx jest server/lib
 */

import mysql from 'mysql2/promise';
import { TenantDb, closePool } from '../../db/tenant';
import { createTestDatabase } from '../../test-support/database';
import { recomputeTermResults, getStudentTermResults } from '../results';

const DB_URL = process.env.TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

describeDb('term results', () => {
  let pool: mysql.Pool;
  let db: TenantDb;
  let termId: number;
  let subjectId: number;
  let students: number[] = [];
  const assessments: Record<string, number> = {};
  const sheets: Record<string, number> = {};

  const setStatus = (name: string, status: string) =>
    pool.query('UPDATE marksheets SET status = ? WHERE id = ?', [status, sheets[name]]);

  beforeAll(async () => {
    // Own database: suites run in parallel workers and would otherwise drop
    // and recreate each other's schema mid-run.
    const test = await createTestDatabase(DB_URL as string, 'results');
    pool = test.pool;
    const schoolId = test.schoolId;

    db = new TenantDb(schoolId, pool);

    // Nabisunsa's rules: 20/80, best 3 coursework.
    await db.insert('school_grading_config', { ca_weight: 20, eot_weight: 80, ca_best_of: 3 });
    for (const [grade, min, points] of [
      ['A', 80, 1], ['B', 70, 2], ['C', 60, 3], ['D', 50, 4],
      ['E', 40, 5], ['O', 30, 6], ['F', 0, 9],
    ] as const) {
      await db.insert('grading_scale', { grade, min_score: min, points });
    }

    termId = await db.insert('terms', {
      academic_year: 2026, term_number: 3, name: 'Term 3 2026', is_current: 1,
    });
    const classId = await db.insert('classes', {
      code: 'S4', name: 'Senior Four', level: 'O-Level',
    });
    subjectId = await db.insert('subjects', { code: 'MTC', name: 'Mathematics' });

    assessments.CA1 = await db.insert('assessments', {
      code: 'CA1', name: 'Coursework 1', category: 'coursework', is_final: 0,
    });
    assessments.CA2 = await db.insert('assessments', {
      code: 'CA2', name: 'Coursework 2', category: 'coursework', is_final: 0,
    });
    assessments.BOT = await db.insert('assessments', {
      code: 'BOT', name: 'Beginning of Term', category: 'exam', is_final: 0,
    });
    assessments.EOT = await db.insert('assessments', {
      code: 'EOT', name: 'End of Term', category: 'exam', is_final: 1,
    });

    for (let i = 0; i < 3; i += 1) {
      students.push(await db.insert('students', {
        registration_no: `T/00${i + 1}`,
        first_name: `Student${i + 1}`, last_name: 'Test',
        class_id: classId, level: 'O-Level',
      }));
    }

    for (const code of ['CA1', 'CA2', 'BOT', 'EOT']) {
      sheets[code] = await db.insert('marksheets', {
        term_id: termId, class_id: classId, subject_id: subjectId,
        assessment_id: assessments[code], status: 'draft',
      });
    }

    // Student 1: coursework 90/80, BOT 10, EOT 60.
    // Student 2: coursework 50/50, EOT 60  (ties student 1's exam).
    // Student 3: coursework 70/70, EOT 90.
    const marks: [string, number[]][] = [
      ['CA1', [90, 50, 70]],
      ['CA2', [80, 50, 70]],
      ['BOT', [10, 10, 10]],
      ['EOT', [60, 60, 90]],
    ];
    for (const [code, scores] of marks) {
      for (const [i, score] of scores.entries()) {
        await db.insert('marks', {
          marksheet_id: sheets[code], student_id: students[i], score, is_absent: 0,
        });
      }
    }
  });

  afterAll(async () => {
    await pool?.end();
    await closePool();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM term_results');
    for (const code of Object.keys(sheets)) await setStatus(code, 'draft');
  });

  it('writes nothing while no marksheet is released', async () => {
    // The whole promise in one test: marks exist, none are published,
    // therefore nothing exists for a parent to see.
    const written = await recomputeTermResults(db, termId);
    expect(written).toBe(0);
    expect(await db.count('term_results')).toBe(0);
  });

  it('ignores marks that are entered or verified but not released', async () => {
    await setStatus('CA1', 'entered');
    await setStatus('CA2', 'verified');
    await setStatus('EOT', 'verified');
    expect(await recomputeTermResults(db, termId)).toBe(0);
    expect(await db.count('term_results')).toBe(0);
  });

  it('writes no result while the end-of-term paper is unreleased', async () => {
    // Coursework alone must not produce a "final" mark: the exam carries 80%.
    await setStatus('CA1', 'published');
    await setStatus('CA2', 'published');
    expect(await recomputeTermResults(db, termId)).toBe(0);
  });

  it('computes the weighted mark once everything is released', async () => {
    await setStatus('CA1', 'published');
    await setStatus('CA2', 'published');
    await setStatus('EOT', 'published');
    const written = await recomputeTermResults(db, termId);
    expect(written).toBe(3);

    const [first] = await getStudentTermResults(db, students[0], termId);
    // CA = (90 + 80) / 2 = 85; final = 85*0.2 + 60*0.8 = 17 + 48 = 65
    expect(Number(first.caScore)).toBe(85);
    expect(Number(first.eotScore)).toBe(60);
    expect(Number(first.finalScore)).toBe(65);
    expect(first.grade).toBe('C');
  });

  it('excludes exams that are not the final one', async () => {
    // Beginning of Term is reported to parents but must not drag the mark
    // down: student 1 scored 10 in it and still finishes on 65.
    await setStatus('CA1', 'published');
    await setStatus('CA2', 'published');
    await setStatus('BOT', 'published');
    await setStatus('EOT', 'published');
    await recomputeTermResults(db, termId);

    const [first] = await getStudentTermResults(db, students[0], termId);
    expect(Number(first.finalScore)).toBe(65);
  });

  it('ranks within the class, sharing positions on a tie', async () => {
    await setStatus('CA1', 'published');
    await setStatus('CA2', 'published');
    await setStatus('EOT', 'published');
    await recomputeTermResults(db, termId);

    // finals: s1 = 65, s2 = 58, s3 = 86  -> s3 first, s1 second, s2 third
    const positions = await Promise.all(
      students.map(async (id) => (await getStudentTermResults(db, id, termId))[0].position),
    );
    expect(positions).toEqual([2, 3, 1]);
  });

  it('withdraws the computed result when the exam is pulled back', async () => {
    await setStatus('CA1', 'published');
    await setStatus('CA2', 'published');
    await setStatus('EOT', 'published');
    await recomputeTermResults(db, termId);
    expect(await db.count('term_results')).toBe(3);

    // Withdrawing the paper must withdraw the mark it fed — leaving a stale
    // figure would be worse than nothing, because a parent would believe it.
    await setStatus('EOT', 'verified');
    await recomputeTermResults(db, termId);
    expect(await db.count('term_results')).toBe(0);
  });

  it('treats an absence as no score rather than a zero', async () => {
    await setStatus('CA1', 'published');
    await setStatus('CA2', 'published');
    await setStatus('EOT', 'published');

    // Student 1 was absent for CA1; their coursework is now CA2 alone.
    await pool.query(
      'UPDATE marks SET score = NULL, is_absent = 1 WHERE marksheet_id = ? AND student_id = ?',
      [sheets.CA1, students[0]],
    );
    await recomputeTermResults(db, termId);

    const [first] = await getStudentTermResults(db, students[0], termId);
    // CA = 80 (CA2 only), not 40 (an average against a zero).
    expect(Number(first.caScore)).toBe(80);
    expect(Number(first.finalScore)).toBe(64);
  });

  it('reports the size of the group a position is out of', async () => {
    await setStatus('CA1', 'published');
    await setStatus('CA2', 'published');
    await setStatus('EOT', 'published');
    await recomputeTermResults(db, termId);

    const [first] = await getStudentTermResults(db, students[0], termId);
    expect(Number(first.groupSize)).toBe(3);
  });
});

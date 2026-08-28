/**
 * Report cards, against a real MySQL server.
 *
 * The card is what a school prints, signs and hands to a parent, so the two
 * things under test are that it can never show an unreleased mark, and that
 * a student with nothing released still gets a card that says so — a missing
 * card in a stack of forty is worse than an honest empty one.
 */

import mysql from 'mysql2/promise';
import { TenantDb, closePool } from '../../db/tenant';
import { createTestDatabase } from '../../test-support/database';
import { recomputeTermResults } from '../results';
import { buildClassReportCards, buildStudentReportCard } from '../reports';

const DB_URL = process.env.TEST_DATABASE_URL;
const describeDb = DB_URL ? describe : describe.skip;

describeDb('report cards', () => {
  let pool: mysql.Pool;
  let db: TenantDb;
  let termId: number;
  let classId: number;
  let streamId: number;
  const students: number[] = [];
  const sheets: Record<string, number> = {};

  const publish = (code: string) =>
    pool.query("UPDATE marksheets SET status='published' WHERE id = ?", [sheets[code]]);

  beforeAll(async () => {
    const test = await createTestDatabase(DB_URL as string, 'reports');
    pool = test.pool;
    db = new TenantDb(test.schoolId, pool);

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
    classId = await db.insert('classes', { code: 'S4', name: 'Senior Four', level: 'O-Level' });
    streamId = await db.insert('streams', { class_id: classId, name: 'Red' });

    const maths = await db.insert('subjects', { code: 'MTC', name: 'Mathematics' });
    const english = await db.insert('subjects', { code: 'ENG', name: 'English Language' });
    const eot = await db.insert('assessments', {
      code: 'EOT', name: 'End of Term', category: 'exam', is_final: 1,
    });

    // Four students; the fourth sits nothing, to prove they still get a card.
    for (const [first, last] of [
      ['Aisha', 'Nakato'], ['Brenda', 'Auma'], ['Cynthia', 'Namuli'], ['Doreen', 'Akello'],
    ]) {
      students.push(await db.insert('students', {
        registration_no: `T/${first}`, first_name: first, last_name: last,
        class_id: classId, stream_id: streamId, level: 'O-Level',
      }));
    }

    for (const [name, subject] of [['MTC', maths], ['ENG', english]] as const) {
      sheets[name] = await db.insert('marksheets', {
        term_id: termId, class_id: classId, stream_id: streamId,
        subject_id: subject, assessment_id: eot, status: 'draft',
      });
    }

    // Maths: 90, 70, 70, none.   English: 60, 80, 40, none.
    const scores: Record<string, (number | null)[]> = {
      MTC: [90, 70, 70, null],
      ENG: [60, 80, 40, null],
    };
    for (const [code, list] of Object.entries(scores)) {
      for (const [i, score] of list.entries()) {
        if (score == null) continue;
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
    await pool.query("UPDATE marksheets SET status='draft'");
  });

  it('shows no marks at all while nothing is released', async () => {
    // The promise the school makes to itself: an unreleased mark cannot
    // reach a printed card.
    const cards = await buildClassReportCards(db, termId, classId, streamId);
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => c.subjects.length === 0)).toBe(true);
    expect(cards.every((c) => c.average === null)).toBe(true);
    expect(cards.every((c) => c.overallPosition === null)).toBe(true);
  });

  it('shows only the released subject when one of two is out', async () => {
    await publish('MTC');
    await recomputeTermResults(db, termId);

    const cards = await buildClassReportCards(db, termId, classId, streamId);
    const aisha = cards.find((c) => c.firstName === 'Aisha')!;
    expect(aisha.subjects.map((s) => s.subjectName)).toEqual(['Mathematics']);
    expect(aisha.average).toBe(90);
  });

  it('averages across released subjects', async () => {
    await publish('MTC');
    await publish('ENG');
    await recomputeTermResults(db, termId);

    const cards = await buildClassReportCards(db, termId, classId, streamId);
    const aisha = cards.find((c) => c.firstName === 'Aisha')!;
    expect(aisha.subjectsCounted).toBe(2);
    expect(aisha.totalMarks).toBe(150);   // 90 + 60
    expect(aisha.average).toBe(75);
    expect(aisha.totalPoints).toBe(4);    // A(1) + C(3)
  });

  it('ranks overall by average, with ties sharing a position', async () => {
    await publish('MTC');
    await publish('ENG');
    await recomputeTermResults(db, termId);

    const cards = await buildClassReportCards(db, termId, classId, streamId);
    const byName = new Map(cards.map((c) => [c.firstName, c]));
    // averages: Aisha 75, Brenda 75, Cynthia 55, Doreen none
    expect(byName.get('Aisha')!.overallPosition).toBe(1);
    expect(byName.get('Brenda')!.overallPosition).toBe(1);
    expect(byName.get('Cynthia')!.overallPosition).toBe(3);
  });

  it('still produces a card for a student with nothing released', async () => {
    // A missing card in a stack of forty is worse than an honest empty one.
    await publish('MTC');
    await publish('ENG');
    await recomputeTermResults(db, termId);

    const cards = await buildClassReportCards(db, termId, classId, streamId);
    const doreen = cards.find((c) => c.firstName === 'Doreen')!;
    expect(doreen).toBeDefined();
    expect(doreen.subjects).toHaveLength(0);
    expect(doreen.average).toBeNull();
    // Not ranked last — simply not ranked.
    expect(doreen.overallPosition).toBeNull();
  });

  it('counts the group as those actually ranked', async () => {
    await publish('MTC');
    await publish('ENG');
    await recomputeTermResults(db, termId);

    const cards = await buildClassReportCards(db, termId, classId, streamId);
    // Three students have results; the fourth sat nothing.
    expect(cards.every((c) => c.groupSize === 3)).toBe(true);
  });

  it('builds one student\'s card with the school and term named', async () => {
    await publish('MTC');
    await recomputeTermResults(db, termId);

    const built = await buildStudentReportCard(db, termId, students[0]);
    expect(built).not.toBeNull();
    expect(built!.card.firstName).toBe('Aisha');
    expect(built!.context.term.name).toBe('Term 3 2026');
    expect(built!.context.school.name).toBe('Test School');
    expect(built!.context.className).toBe('Senior Four');
  });

  it('returns nothing for a student who is not at this school', async () => {
    expect(await buildStudentReportCard(db, termId, 999999)).toBeNull();
  });

  it('drops the results again when a marksheet is withdrawn', async () => {
    await publish('MTC');
    await publish('ENG');
    await recomputeTermResults(db, termId);
    // Address by name: cards are ordered by surname, and the first of those
    // is the student who sat nothing.
    const before = await buildClassReportCards(db, termId, classId, streamId);
    expect(before.find((c) => c.firstName === 'Aisha')!.subjects).toHaveLength(2);

    await pool.query("UPDATE marksheets SET status='verified' WHERE id = ?", [sheets.ENG]);
    await recomputeTermResults(db, termId);

    const cards = await buildClassReportCards(db, termId, classId, streamId);
    const aisha = cards.find((c) => c.firstName === 'Aisha')!;
    expect(aisha.subjects.map((s) => s.subjectName)).toEqual(['Mathematics']);
  });
});

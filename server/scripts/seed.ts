/**
 * Seeds a demo school so the portal can be run and shown.
 *
 * Safe to re-run: it clears and rebuilds the demo school only, leaving any
 * other tenant alone.
 *
 *   DATABASE_URL='mysql://root@127.0.0.1:3306/midway_school' npm run seed
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { TenantDb, closePool } from '../db/tenant';
import { recomputeTermResults } from '../lib/results';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { deleteSchoolBySlug } = require('./lib/teardown');

const SLUG = 'nabisunsa-girls';

const SUBJECTS = [
  ['MTC', 'Mathematics', 'Science'],
  ['ENG', 'English Language', 'Language'],
  ['PHY', 'Physics', 'Science'],
  ['CHE', 'Chemistry', 'Science'],
  ['BIO', 'Biology', 'Science'],
  ['HIS', 'History', 'Arts'],
  ['GEO', 'Geography', 'Arts'],
] as const;

const GRADING_SCALE: [string, number, string][] = [
  ['A', 80, 'Distinction'],
  ['B', 70, 'Credit'],
  ['C', 60, 'Credit'],
  ['D', 50, 'Pass'],
  ['E', 40, 'Pass'],
  ['O', 30, 'Subsidiary'],
  ['F', 0, 'Failure'],
];

const FIRST = ['Aisha', 'Brenda', 'Cynthia', 'Doreen', 'Esther', 'Faith', 'Grace',
  'Halima', 'Irene', 'Joan', 'Kevina', 'Lydia', 'Mariam', 'Nakato', 'Olivia',
  'Patience', 'Rehema', 'Sarah', 'Teddy', 'Vanessa'];
const LAST = ['Nakato', 'Auma', 'Namuli', 'Achieng', 'Nabirye', 'Akello', 'Nanyonga',
  'Atim', 'Nakimuli', 'Adongo'];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = await mysql.createConnection({ uri: url, multipleStatements: false });
  const q = async (sql: string, params: unknown[] = []) => {
    const [result] = await db.query(sql, params);
    return result as mysql.ResultSetHeader;
  };

  // Rebuild only the demo tenant.
  if (await deleteSchoolBySlug(db, SLUG)) {
    console.log('removed previous demo school');
  }

  const school = (await q(
    `INSERT INTO schools (slug, name, short_name, motto, district, status, fee_per_student)
     VALUES (?, ?, ?, ?, ?, 'active', 5000)`,
    [SLUG, "Nabisunsa Girls' Secondary School", 'Nabisunsa', 'Knowledge is Light', 'Kampala'],
  )).insertId;

  await q(
    'INSERT INTO school_grading_config (school_id, ca_weight, eot_weight, ca_best_of) VALUES (?, 20, 80, 3)',
    [school],
  );
  for (const [i, [grade, min, label]] of GRADING_SCALE.entries()) {
    await q(
      'INSERT INTO grading_scale (school_id, grade, min_score, label, points, sort_order) VALUES (?,?,?,?,?,?)',
      [school, grade, min, label, i + 1, i],
    );
  }

  const term = (await q(
    `INSERT INTO terms (school_id, academic_year, term_number, name, is_current)
     VALUES (?, 2026, 3, 'Term 3 2026', 1)`,
    [school],
  )).insertId;
  await q('UPDATE schools SET current_term_id = ? WHERE id = ?', [term, school]);

  const s4 = (await q(
    "INSERT INTO classes (school_id, code, name, level, sort_order) VALUES (?, 'S4', 'Senior Four', 'O-Level', 4)",
    [school],
  )).insertId;
  const streamRed = (await q(
    "INSERT INTO streams (school_id, class_id, name) VALUES (?, ?, 'Red')", [school, s4],
  )).insertId;

  const subjectIds: Record<string, number> = {};
  for (const [code, name, category] of SUBJECTS) {
    subjectIds[code] = (await q(
      'INSERT INTO subjects (school_id, code, name, level, category) VALUES (?,?,?,?,?)',
      [school, code, name, 'O-Level', category],
    )).insertId;
  }

  const assessments: Record<string, number> = {};
  for (const [code, name, category, isFinal, order] of [
    ['BOT', 'Beginning of Term', 'exam', 0, 0],
    ['CA1', 'Coursework 1', 'coursework', 0, 1],
    ['CA2', 'Coursework 2', 'coursework', 0, 2],
    // Only this one carries the 80%.
    ['EOT', 'End of Term', 'exam', 1, 3],
  ] as const) {
    assessments[code] = (await q(
      'INSERT INTO assessments (school_id, code, name, category, is_final, sort_order) VALUES (?,?,?,?,?,?)',
      [school, code, name, category, isFinal, order],
    )).insertId;
  }

  // Staff. The DoS office is a team: two clerks who enter, and the DoS who
  // checks and releases.
  const password = await bcrypt.hash('portal123', 10);
  let firstParentId: number | null = null;
  const users: Record<string, number> = {};
  for (const [email, name, role] of [
    ['dos@nabisunsa.test', 'Mrs. Nakayiza', 'dos'],
    ['clerk1@nabisunsa.test', 'Mr. Okello', 'dos_staff'],
    ['clerk2@nabisunsa.test', 'Ms. Namara', 'dos_staff'],
    ['admin@nabisunsa.test', 'Head Teacher', 'school_admin'],
  ] as const) {
    users[role === 'dos_staff' ? email : role] = (await q(
      'INSERT INTO users (school_id, role, display_name, email, password_hash) VALUES (?,?,?,?,?)',
      [school, role, name, email, password],
    )).insertId;
  }

  // A class of students. The first three get family accounts so the mobile
  // API can be exercised, including one parent with two daughters at the
  // school — students.user_id repeats, which the API must handle.
  const studentIds: number[] = [];
  for (let i = 0; i < 28; i += 1) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3) % LAST.length];

    let parentUser: number | null = null;
    if (i === 0 || i === 1) {
      // One account, two children.
      parentUser = i === 0
        ? (await q(
            'INSERT INTO users (school_id, role, display_name, email, password_hash) VALUES (?,?,?,?,?)',
            [school, 'student_parent', 'Mr. & Mrs. Nakato', 'parent1@nabisunsa.test', password],
          )).insertId
        : firstParentId;
      if (i === 0) firstParentId = parentUser;
    } else if (i === 2) {
      parentUser = (await q(
        'INSERT INTO users (school_id, role, display_name, email, password_hash) VALUES (?,?,?,?,?)',
        [school, 'student_parent', 'Mr. Achieng', 'parent2@nabisunsa.test', password],
      )).insertId;
    }

    studentIds.push((await q(
      `INSERT INTO students (school_id, user_id, registration_no, first_name, last_name, class_id, stream_id, level, parent_name)
       VALUES (?,?,?,?,?,?,?, 'O-Level', ?)`,
      [school, parentUser, `NGSS/2026/${String(i + 1).padStart(3, '0')}`, first, last, s4, streamRed,
       parentUser ? 'Registered parent' : null],
    )).insertId);
  }

  // Marksheets across the workflow, so the dashboard shows a realistic term.
  const plan: [string, string, 'draft' | 'entered' | 'verified' | 'published'][] = [
    ['MTC', 'EOT', 'draft'],
    ['ENG', 'EOT', 'draft'],
    ['PHY', 'EOT', 'entered'],
    ['CHE', 'EOT', 'verified'],
    ['BIO', 'EOT', 'published'],
    ['HIS', 'EOT', 'published'],
    ['GEO', 'CA1', 'draft'],
  ];

  const clerk = users['clerk1@nabisunsa.test'];
  for (const [subject, assessment, status] of plan) {
    const sheet = (await q(
      `INSERT INTO marksheets
         (school_id, term_id, class_id, stream_id, subject_id, assessment_id, status,
          entered_by, verified_by, published_by, published_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        school, term, s4, streamRed, subjectIds[subject], assessments[assessment], status,
        status === 'draft' ? null : clerk,
        status === 'verified' || status === 'published' ? users.dos : null,
        status === 'published' ? users.dos : null,
        status === 'published' ? new Date() : null,
      ],
    )).insertId;

    if (status !== 'draft') {
      for (const [index, studentId] of studentIds.entries()) {
        // Keyed on position, not the database id: ids move on every reseed,
        // so id-based rules make the demo data — and the tests that read it —
        // quietly different each time.
        //
        // The last student sits nothing at all, so the report card run always
        // includes the "no results released" case.
        const sitsNothing = index === studentIds.length - 1;
        if (sitsNothing) continue;

        const absent = index % 9 === 4;
        await q(
          'INSERT INTO marks (school_id, marksheet_id, student_id, score, is_absent) VALUES (?,?,?,?,?)',
          [school, sheet, studentId, absent ? null : 35 + ((index * 7) % 60), absent ? 1 : 0],
        );
      }
    }
  }

  // The seed inserts published marksheets directly rather than through the
  // workflow, so the results they feed have to be computed explicitly —
  // otherwise the demo shows released marks with no report card behind them.
  const results = await recomputeTermResults(new TenantDb(school), term);
  console.log(`computed ${results} term results`);

  await db.end();
  await closePool();

  console.log(`
Seeded "${SLUG}" (school id ${school}).

  Director of Studies   dos@nabisunsa.test      portal123
  Office staff          clerk1@nabisunsa.test   portal123
                        clerk2@nabisunsa.test   portal123
  Head teacher          admin@nabisunsa.test    portal123

Family accounts (mobile app only):
  Two daughters         parent1@nabisunsa.test  portal123
  One daughter          parent2@nabisunsa.test  portal123

7 marksheets for Term 3 2026, S4 Red, 28 students.
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

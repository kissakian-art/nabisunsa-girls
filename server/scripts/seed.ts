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

/**
 * Removes a tenant and everything belonging to it, in dependency order.
 *
 * A plain `DELETE FROM schools` does NOT work: marksheets.stream_id is
 * RESTRICT (MySQL forbids CASCADE or SET NULL on a column that a stored
 * generated column depends on), so the cascade from schools -> streams is
 * blocked while marksheets exist. Tenant teardown is therefore an explicit,
 * ordered operation — which is the right shape anyway, since a real
 * termination exports the data first.
 */
async function deleteSchool(
  q: (sql: string, params?: unknown[]) => Promise<mysql.ResultSetHeader>,
  schoolId: number,
): Promise<void> {
  // Children first, then their parents.
  await q('DELETE FROM marks WHERE school_id = ?', [schoolId]);
  await q('DELETE FROM term_results WHERE school_id = ?', [schoolId]);
  await q('DELETE FROM marksheets WHERE school_id = ?', [schoolId]);
  await q('DELETE FROM student_uce_grades WHERE student_id IN (SELECT id FROM students WHERE school_id = ?)', [schoolId]);
  await q('DELETE FROM student_subjects WHERE student_id IN (SELECT id FROM students WHERE school_id = ?)', [schoolId]);
  await q('DELETE FROM students WHERE school_id = ?', [schoolId]);
  await q('DELETE FROM teacher_allocations WHERE school_id = ?', [schoolId]);
  await q('DELETE FROM combination_requirements WHERE combination_id IN (SELECT id FROM combinations WHERE school_id = ?)', [schoolId]);
  await q('DELETE FROM combination_subjects WHERE combination_id IN (SELECT id FROM combinations WHERE school_id = ?)', [schoolId]);
  await q('DELETE FROM combinations WHERE school_id = ?', [schoolId]);
  await q('DELETE FROM streams WHERE school_id = ?', [schoolId]);
  // schools.current_term_id points at terms, so clear it before terms go.
  await q('UPDATE schools SET current_term_id = NULL WHERE id = ?', [schoolId]);
  await q('DELETE FROM schools WHERE id = ?', [schoolId]);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = await mysql.createConnection({ uri: url, multipleStatements: false });
  const q = async (sql: string, params: unknown[] = []) => {
    const [result] = await db.query(sql, params);
    return result as mysql.ResultSetHeader;
  };

  // Rebuild only the demo tenant.
  const [existing] = await db.query<mysql.RowDataPacket[]>(
    'SELECT id FROM schools WHERE slug = ?', [SLUG],
  );
  if (existing[0]) {
    await deleteSchool(q, existing[0].id as number);
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
  for (const [code, name, category, order] of [
    ['BOT', 'Beginning of Term', 'exam', 0],
    ['CA1', 'Coursework 1', 'coursework', 1],
    ['CA2', 'Coursework 2', 'coursework', 2],
    ['EOT', 'End of Term', 'exam', 3],
  ] as const) {
    assessments[code] = (await q(
      'INSERT INTO assessments (school_id, code, name, category, sort_order) VALUES (?,?,?,?,?)',
      [school, code, name, category, order],
    )).insertId;
  }

  // Staff. The DoS office is a team: two clerks who enter, and the DoS who
  // checks and releases.
  const password = await bcrypt.hash('portal123', 10);
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

  // A class of students.
  const studentIds: number[] = [];
  for (let i = 0; i < 28; i += 1) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3) % LAST.length];
    studentIds.push((await q(
      `INSERT INTO students (school_id, registration_no, first_name, last_name, class_id, stream_id, level)
       VALUES (?,?,?,?,?,?, 'O-Level')`,
      [school, `NGSS/2026/${String(i + 1).padStart(3, '0')}`, first, last, s4, streamRed],
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
      for (const studentId of studentIds) {
        // A couple of absences, so the entry screen shows that case.
        const absent = studentId % 17 === 0;
        await q(
          'INSERT INTO marks (school_id, marksheet_id, student_id, score, is_absent) VALUES (?,?,?,?,?)',
          [school, sheet, studentId, absent ? null : 35 + ((studentId * 7) % 60), absent ? 1 : 0],
        );
      }
    }
  }

  await db.end();

  console.log(`
Seeded "${SLUG}" (school id ${school}).

  Director of Studies   dos@nabisunsa.test      portal123
  Office staff          clerk1@nabisunsa.test   portal123
                        clerk2@nabisunsa.test   portal123
  Head teacher          admin@nabisunsa.test    portal123

7 marksheets for Term 3 2026, S4 Red, 28 students.
`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

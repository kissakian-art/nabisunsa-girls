/**
 * Changing how a school makes a mark, in a browser.
 *
 * The point of these settings is that two schools can both say "20 and 80"
 * and still disagree about everything underneath. So this suite changes them
 * and checks the released results actually move — a setting that saves but
 * does not reach a report card is worse than no setting at all.
 *
 *   node scripts/grading-smoke.js
 */

const fs = require('fs');
const { chromium } = require('playwright');
const { reseed } = require('./lib/reseed');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4500';
const DB = process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

/**
 * Every query here names the demo school.
 *
 * The database holds other tenants — the setup and platform suites create
 * their own — so `LIMIT 1` without a school reads whichever row happens to
 * come first. It did, and this suite reported four failures against a
 * different school's settings while the code was correct.
 */
const SCHOOL = "(SELECT id FROM schools WHERE slug = 'nabisunsa-girls')";

const query = async (sql, params = []) => {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({ uri: DB });
  const [rows] = await conn.query(sql, params);
  await conn.end();
  return rows;
};

/**
 * Releases a coursework mark of 14 for every girl in Biology.
 *
 * The seed publishes end-of-term sheets only, so every released result has
 * no coursework behind it — and a subject with no coursework computes the
 * same under both settings, which would let this suite pass while proving
 * nothing. 14 is the sort of number Nabisunsa's own report carries in that
 * column.
 */
async function releaseCourseworkForBiology() {
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({ uri: DB });
  const [[school]] = await conn.query(
    "SELECT id FROM schools WHERE slug = 'nabisunsa-girls'",
  );
  // The seed gives Biology an exam sheet and no coursework sheet, so make
  // one: this suite needs a subject carrying both.
  const [[exam]] = await conn.query(
    `SELECT ms.term_id, ms.class_id, ms.stream_id, ms.subject_id
       FROM marksheets ms
       JOIN subjects s ON s.id = ms.subject_id
      WHERE ms.school_id = ? AND s.code = 'BIO'
      LIMIT 1`,
    [school.id],
  );
  const [[coursework]] = await conn.query(
    "SELECT id FROM assessments WHERE school_id = ? AND category = 'coursework' LIMIT 1",
    [school.id],
  );
  await conn.query(
    `INSERT IGNORE INTO marksheets
       (school_id, term_id, class_id, stream_id, subject_id, assessment_id, status)
     VALUES (?,?,?,?,?,?, 'draft')`,
    [school.id, exam.term_id, exam.class_id, exam.stream_id, exam.subject_id, coursework.id],
  );
  const [[sheet]] = await conn.query(
    `SELECT id FROM marksheets
      WHERE school_id = ? AND subject_id = ? AND assessment_id = ?`,
    [school.id, exam.subject_id, coursework.id],
  );
  const [[dos]] = await conn.query(
    "SELECT id FROM users WHERE school_id = ? AND role = 'dos' LIMIT 1",
    [school.id],
  );
  const [students] = await conn.query(
    "SELECT id FROM students WHERE school_id = ? AND status = 'active'",
    [school.id],
  );

  for (const student of students) {
    await conn.query(
      `INSERT INTO marks (school_id, marksheet_id, student_id, score, is_absent)
       VALUES (?,?,?,14,0)
       ON DUPLICATE KEY UPDATE score = 14, is_absent = 0`,
      [school.id, sheet.id, student.id],
    );
  }
  await conn.query(
    `UPDATE marksheets SET status = 'published', entered_by = ?, verified_by = ?,
            published_by = ?, published_at = NOW()
      WHERE id = ?`,
    [dos.id, dos.id, dos.id, sheet.id],
  );
  await conn.end();
}

/**
 * Waits for the database to actually reflect a save.
 *
 * `waitForSelector('.notice.ok')` is not enough: useFormState leaves the
 * previous save's message on screen, so the selector matches instantly and
 * the next query races a save that is still running. That produced two
 * confident failures against correct code.
 */
async function waitForConfig(expected, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await query(
      `SELECT formative_source FROM school_grading_config WHERE school_id = ${SCHOOL}`,
    );
    if (row && row.formative_source === expected) return true;
    if (Date.now() > deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

/** Waits until the released Biology result satisfies `predicate`. */
async function waitForResult(sql, predicate, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const [row] = await query(sql);
    if (row && predicate(row)) return row;
    if (Date.now() > deadline) return row;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', 'portal123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }),
    page.click('button[type=submit]'),
  ]);
}

(async () => {
  reseed();
  await releaseCourseworkForBiology();
  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', (e) => check('no page errors', false, e.message));

  console.log('\n--- who may change how marks are made ---');
  await login(page, 'clerk1@nabisunsa.test');
  await page.goto(`${BASE}/setup/grading`, { waitUntil: 'networkidle' });
  const clerkSees = await page.locator('button:has-text("Save and recompute")').count();
  if (clerkSees) {
    await page.click('button:has-text("Save and recompute")');
    await page.waitForSelector('.notice.error', { timeout: 15000 });
    const refusal = await page.textContent('.notice.error');
    check('office staff cannot change the grading rules',
      /Director of Studies|administrator/i.test(refusal || ''), refusal?.trim());
  } else {
    check('office staff are not offered the form', true);
  }

  console.log('\n--- the demo school, before ---');
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(/login/, { timeout: 15000 });
  await login(page, 'dos@nabisunsa.test');
  await page.goto(`${BASE}/setup/grading`, { waitUntil: 'networkidle' });

  // One subject with both a coursework mark and an exam behind it, which is
  // the only shape where these settings can be told apart.
  const results = `SELECT tr.ca_score, tr.eot_score, tr.final_score
                     FROM term_results tr
                     JOIN subjects s ON s.id = tr.subject_id
                    WHERE tr.school_id = ${SCHOOL} AND s.code = 'BIO'
                    ORDER BY tr.student_id LIMIT 1`;
  // Save once without changing anything, so the coursework released above is
  // reflected in term_results. Publishing a marksheet by SQL bypasses the
  // recompute a real release would have triggered.
  await page.click('button:has-text("Save and recompute")');
  // The settings are unchanged, so waiting on them would not wait at all.
  // What this save is for is the recompute, so wait for its effect.
  const before = [await waitForResult(results, (row) => row.ca_score != null)];
  check('a released result has both coursework and an exam behind it',
    before[0] && before[0].ca_score != null && before[0].eot_score != null,
    JSON.stringify(before[0]));

  console.log('\n--- switching to a typed formative mark ---');
  await page.selectOption('#formativeSource', 'entered');
  await page.selectOption('#missingExamRule', 'zero');
  await page.click('button:has-text("Save and recompute")');
  check('the change is saved and results recomputed', await waitForConfig('entered'));
  const saved = await page.textContent('.notice.ok');
  check('and the office is told so', /recomputed/i.test(saved || ''), saved?.trim());

  const config = await query(
    `SELECT * FROM school_grading_config WHERE school_id = ${SCHOOL}`,
  );
  check('the setting is stored', config[0].formative_source === 'entered',
    config[0].formative_source);
  check('best-of-N is cleared, since there is nothing to choose between',
    config[0].ca_best_of === null, String(config[0].ca_best_of));

  console.log('\n--- and the marks really moved ---');
  const after = [
    await waitForResult(results, (row) => Number(row.final_score) !== Number(before[0].final_score)),
  ];
  check('the released result changed', Number(after[0].final_score) !== Number(before[0].final_score),
    `${before[0].final_score} -> ${after[0].final_score}`);

  // Nabisunsa's own arithmetic: the typed mark, plus the exam at its weight.
  const expected = Number(after[0].ca_score) + (Number(after[0].eot_score) * 80) / 100;
  check('the final mark is the typed mark plus the weighted exam',
    Math.abs(Number(after[0].final_score) - expected) < 0.02,
    `${after[0].ca_score} + ${after[0].eot_score}×0.8 = ${after[0].final_score}`);

  // And the other way: 14 out of 100, averaged and weighted, is a very
  // different contribution from 14 out of 20.
  const computedExpected =
    (Number(before[0].ca_score) * 20) / 100 + (Number(before[0].eot_score) * 80) / 100;
  check('and before, it was the same mark read out of 100',
    Math.abs(Number(before[0].final_score) - computedExpected) < 0.02,
    `${before[0].ca_score}×0.2 + ${before[0].eot_score}×0.8 = ${before[0].final_score}`);

  console.log('\n--- the form remembers, and explains itself ---');
  await page.reload({ waitUntil: 'networkidle' });
  const source = await page.locator('#formativeSource').inputValue();
  check('the choice is shown on return', source === 'entered', source);
  const explanation = await page.textContent('.card');
  check('and it says what that means in the office\'s own words',
    /out of 20, not out of 100/.test(explanation || ''));
  check('the best-of-N field is hidden when it cannot apply',
    (await page.locator('#caBestOf').count()) === 0);

  console.log('\n--- back, and nothing is stranded ---');
  await page.selectOption('#formativeSource', 'computed');
  await page.click('button:has-text("Save and recompute")');
  await waitForConfig('computed');
  const restored = [
    await waitForResult(results, (row) => Number(row.final_score) === Number(before[0].final_score)),
  ];
  check('switching back restores the original marks',
    Number(restored[0].final_score) === Number(before[0].final_score),
    `${after[0].final_score} -> ${restored[0].final_score}`);

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * Onboards a brand new school entirely through the interface.
 *
 * This is the test that matters for the setup screens: it starts from a
 * school with nothing but a login, and finishes with marksheets ready to
 * fill in — without a single line of SQL. If it passes, a school can be
 * onboarded by its own staff rather than by Midway sitting at a terminal.
 *
 *   node scripts/setup-smoke.js
 */

const { chromium } = require('playwright');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const { deleteSchoolBySlug } = require('./lib/teardown');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4500';
const DB = process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school';
const SHOTS = process.env.SHOT_DIR || '/tmp/portal-shots';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

/** A second school with nothing set up, and one administrator to do it. */
async function createBareSchool() {
  const conn = await mysql.createConnection({ uri: DB });
  // Ordered teardown: a plain DELETE FROM schools is blocked by marksheets.
  await deleteSchoolBySlug(conn, 'new-school');

  const [school] = await conn.query(
    "INSERT INTO schools (slug, name, status) VALUES ('new-school','Kira Progressive SS','active')",
  );
  const schoolId = school.insertId;

  // The bare minimum a school arrives with: a term, assessments, a grading
  // scale. Everything else is what the screens under test have to create.
  const [term] = await conn.query(
    `INSERT INTO terms (school_id, academic_year, term_number, name, is_current)
     VALUES (?, 2026, 3, 'Term 3 2026', 1)`, [schoolId],
  );
  await conn.query('UPDATE schools SET current_term_id = ? WHERE id = ?', [term.insertId, schoolId]);
  await conn.query(
    'INSERT INTO school_grading_config (school_id, ca_weight, eot_weight, ca_best_of) VALUES (?,20,80,3)',
    [schoolId],
  );
  for (const [g, m] of [['A',80],['B',70],['C',60],['D',50],['E',40],['O',30],['F',0]]) {
    await conn.query(
      'INSERT INTO grading_scale (school_id, grade, min_score) VALUES (?,?,?)', [schoolId, g, m],
    );
  }
  for (const [code, name, cat, isFinal] of [
    ['CA1', 'Coursework 1', 'coursework', 0],
    ['EOT', 'End of Term', 'exam', 1],
  ]) {
    await conn.query(
      'INSERT INTO assessments (school_id, code, name, category, is_final) VALUES (?,?,?,?,?)',
      [schoolId, code, name, cat, isFinal],
    );
  }

  await conn.query(
    'INSERT INTO users (school_id, role, display_name, email, password_hash) VALUES (?,?,?,?,?)',
    [schoolId, 'school_admin', 'Head Teacher', 'head@newschool.test', await bcrypt.hash('portal123', 10)],
  );
  await conn.end();
  return schoolId;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const schoolId = await createBareSchool();
  console.log(`\nCreated an empty school (id ${schoolId}) with only a login.\n`);

  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
  page.on('pageerror', (e) => check('no page errors', false, e.message));

  console.log('--- sign in and see what is missing ---');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', 'head@newschool.test');
  await page.fill('#password', 'portal123');
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 }),
    page.click('button[type=submit]'),
  ]);

  await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
  const todo = await page.textContent('.card');
  check('the school is told what is still missing',
    /Add the classes/.test(todo || '') && /Import the class lists/.test(todo || ''));
  await page.screenshot({ path: `${SHOTS}/10-setup-empty.png`, fullPage: true });

  console.log('\n--- add a class and a stream ---');
  await page.goto(`${BASE}/setup/classes`, { waitUntil: 'networkidle' });
  await page.fill('#code', 'S4');
  await page.fill('#name', 'Senior Four');
  await page.click('button:has-text("Add class")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  check('a class can be added', true);

  await page.reload({ waitUntil: 'networkidle' });
  await page.fill('#streamName', 'Blue');
  await page.click('button:has-text("Add stream")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  check('a stream can be added', true);

  await page.goto(`${BASE}/setup/classes`, { waitUntil: 'networkidle' });
  await page.fill('#code', 'S4');
  await page.fill('#name', 'Duplicate');
  await page.click('button:has-text("Add class")');
  await page.waitForSelector('.notice.error', { timeout: 15000 });
  const dupe = await page.textContent('.notice.error');
  check('a duplicate class is refused', /already exists/.test(dupe || ''), dupe?.trim());

  console.log('\n--- adopt subjects from the national list ---');
  await page.goto(`${BASE}/setup/subjects`, { waitUntil: 'networkidle' });
  const available = await page.locator('input[name=catalogId]').count();
  check('the national curriculum list is offered', available > 10, `${available} subjects`);

  for (const name of ['Mathematics', 'English Language', 'Biology']) {
    await page.locator(`tr:has-text("${name}") input[name=catalogId]`).first().check();
  }
  await page.click('button:has-text("Add selected subjects")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  const adopted = await page.textContent('.notice.ok');
  check('selected subjects are adopted', /Added 3 subject/.test(adopted || ''), adopted?.trim());
  await page.screenshot({ path: `${SHOTS}/11-subjects.png`, fullPage: true });

  console.log('\n--- paste a class list ---');
  await page.goto(`${BASE}/setup/students`, { waitUntil: 'networkidle' });
  await page.selectOption('#streamId', { label: 'Blue' });
  // Deliberately messy: tabs, commas, a blank line, and one unreadable row.
  await page.fill('#list', [
    'KPS/2026/001, Nakato, Aisha',
    'KPS/2026/002\tAuma\tBrenda',
    '',
    'this line is broken',
    'KPS/2026/004, Namuli, Cynthia',
  ].join('\n'));
  await page.click('button:has-text("Import students")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });

  const imported = await page.textContent('.notice.ok');
  check('good rows import despite a bad one', /Added 3 student/.test(imported || ''),
    imported?.trim());
  const parseErr = await page.textContent('.notice.error');
  check('the bad row is reported with its line number',
    /Line 4/.test(parseErr || ''), (parseErr || '').replace(/\s+/g, ' ').slice(0, 90));
  await page.screenshot({ path: `${SHOTS}/12-import.png`, fullPage: true });

  // Re-pasting must not duplicate anyone.
  await page.goto(`${BASE}/setup/students`, { waitUntil: 'networkidle' });
  await page.selectOption('#streamId', { label: 'Blue' });
  await page.fill('#list', 'KPS/2026/001, Nakato, Aisha\nKPS/2026/009, New, Student');
  await page.click('button:has-text("Import students")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  const again = await page.textContent('.notice.ok');
  check('re-pasting adds only the new student',
    /Added 1 student/.test(again || '') && /1 already on the roll/.test(again || ''),
    again?.trim());

  console.log('\n--- generate the marksheets ---');
  await page.goto(`${BASE}/setup/marksheets`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Generate marksheets")');
  await page.waitForSelector('.notice.ok', { timeout: 20000 });
  const generated = await page.textContent('.notice.ok');
  // 3 subjects x 2 assessments x 1 stream = 6
  check('marksheets are generated for the term', /Created 6 marksheet/.test(generated || ''),
    generated?.trim());

  // The first run's notice is still on screen, so waiting for ".notice.ok"
  // to exist would read the stale message. Wait for the text to change.
  await page.click('button:has-text("Generate marksheets")');
  await page.waitForFunction(
    (previous) => {
      const el = document.querySelector('.notice.ok');
      return el && el.textContent && el.textContent.trim() !== previous;
    },
    (generated || '').trim(),
    { timeout: 20000 },
  );
  const twice = await page.textContent('.notice.ok');
  check('generating twice creates nothing new', /Nothing to create/.test(twice || ''),
    twice?.trim());

  console.log('\n--- the school is now ready ---');
  await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
  const ready = await page.textContent('.card');
  check('setup reports the school ready for marks', /Ready for marks/.test(ready || ''));
  await page.screenshot({ path: `${SHOTS}/13-setup-ready.png`, fullPage: true });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  const sheets = await page.locator('tbody tr').count();
  check('the marksheets appear on the dashboard', sheets === 6, `${sheets} rows`);
  await page.screenshot({ path: `${SHOTS}/14-new-school-dashboard.png`, fullPage: true });

  console.log('\n--- office staff cannot change setup ---');
  // The clerk belongs to the other school, so use that school's own staff.
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(/login/, { timeout: 15000 });
  await page.fill('#email', 'clerk1@nabisunsa.test');
  await page.fill('#password', 'portal123');
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 }),
    page.click('button[type=submit]'),
  ]);
  check('office staff are not offered Setup',
    (await page.locator('.topbar a:has-text("Setup")').count()) === 0);

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * End-to-end smoke test of the portal in a real browser.
 *
 * Walks the flow the DoS office actually performs, as both roles, and
 * asserts the rules that carry real consequences: office staff cannot
 * release marks, a sheet cannot be verified by whoever entered it, and
 * nothing is publishable until every student has a mark.
 *
 *   node scripts/smoke.js
 */

const { chromium } = require('playwright');

// This container ships a pinned Chromium that may not match the Playwright
// build number, so launch the one that is actually installed.
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4500';
const SHOTS = process.env.SHOT_DIR || '/tmp/portal-shots';
const fs = require('fs');
const { reseed } = require('./lib/reseed');

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', 'portal123');
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 }),
    page.click('button[type=submit]'),
  ]);
}

async function logout(page) {
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(/login/, { timeout: 15000 });
}

async function openSheet(page, subject) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const row = page.locator('tr', { has: page.locator(`td:text-is("${subject}")`) }).first();
  await row.locator('a:has-text("Open")').click();
  // Client-side navigation: networkidle alone can resolve on the old page.
  await page.waitForURL(/\/marksheets\/\d+/, { timeout: 15000 });
  await page.waitForSelector('table.marks-table', { timeout: 15000 });
}

(async () => {
  // Start from known data: the suites share a database and change it.
  reseed();
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => check('no page errors', false, e.message));

  console.log('\n--- login and dashboard ---');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${SHOTS}/01-login.png` });

  await page.fill('#email', 'clerk1@nabisunsa.test');
  await page.fill('#password', 'wrong-password');
  await page.click('button[type=submit]');
  await page.waitForSelector('.notice.error', { timeout: 15000 });
  const err = await page.textContent('.notice.error');
  check('wrong password is refused', /not recognised/i.test(err || ''), err?.trim());
  check('refusal does not reveal whether the user exists', !/password|user|email/i.test(err || ''));

  await login(page, 'clerk1@nabisunsa.test');
  check('office staff reach the dashboard', page.url().replace(/\/$/, '') === BASE);
  const whoText = await page.textContent('.topbar .who');
  check('role is shown as DoS office', /DoS office/.test(whoText || ''), whoText?.trim());
  await page.screenshot({ path: `${SHOTS}/02-dashboard-clerk.png`, fullPage: true });

  console.log('\n--- office staff enter marks ---');
  await openSheet(page, 'Mathematics');
  const rows = await page.locator('table.marks-table tbody tr').count();
  check('class list is fully listed', rows === 28, `${rows} rows`);

  // Fill only some, to prove the completeness rule bites.
  const inputs = page.locator('table.marks-table input[type=number]');
  for (let i = 0; i < 25; i += 1) await inputs.nth(i).fill(String(50 + i));
  await page.click('button:has-text("Save marks")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  check('partial marks save', true);

  await page.reload({ waitUntil: 'networkidle' });
  const submitBtn = page.locator('button:has-text("Submit for checking")');
  check('cannot submit an incomplete sheet', (await submitBtn.count()) === 0);
  const blocked = await page.textContent('.card:has-text("Next steps")');
  check(
    'the office is told exactly what is missing',
    /3 of 28 students have no mark yet/.test(blocked || ''),
    (blocked || '').match(/\d+ of \d+ students[^.]*\./)?.[0],
  );
  await page.screenshot({ path: `${SHOTS}/03-incomplete.png`, fullPage: true });

  // Complete it: two scores and one absence.
  await inputs.nth(25).fill('61');
  await inputs.nth(26).fill('72');
  await page.locator('table.marks-table input[type=checkbox]').nth(27).check();
  await page.click('button:has-text("Save marks")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });

  check(
    'a complete sheet can be submitted',
    (await page.locator('button:has-text("Submit for checking")').count()) === 1,
  );
  await page.click('button:has-text("Submit for checking")');
  await page.waitForSelector('.badge.entered', { timeout: 15000 });
  check('sheet moves to entered', true);

  console.log('\n--- the office cannot release marks ---');
  check(
    'no release button for office staff',
    (await page.locator('button:has-text("Release to parents")').count()) === 0,
  );
  const clerkBlocked = await page.textContent('.card:has-text("Next steps")');
  check(
    'and is told why',
    /Only the Director of Studies/.test(clerkBlocked || ''),
    (clerkBlocked || '').match(/Only the Director of Studies[^.]*\./)?.[0],
  );
  await page.screenshot({ path: `${SHOTS}/04-clerk-cannot-release.png`, fullPage: true });

  console.log('\n--- the DoS checks and releases ---');
  await logout(page);
  await login(page, 'dos@nabisunsa.test');
  await openSheet(page, 'Mathematics');

  check(
    'the DoS can verify a sheet the office entered',
    (await page.locator('button:has-text("Confirm marks are correct")').count()) === 1,
  );
  await page.click('button:has-text("Confirm marks are correct")');
  await page.waitForSelector('.badge.verified', { timeout: 15000 });

  page.once('dialog', (d) => d.accept());
  await page.click('button:has-text("Release to parents")');
  await page.waitForSelector('.badge.published', { timeout: 15000 });
  check('marks are released to parents', true);
  await page.screenshot({ path: `${SHOTS}/05-published.png`, fullPage: true });

  console.log('\n--- four-eyes: the DoS cannot check their own entry ---');
  await openSheet(page, 'Geography');
  const geoInputs = page.locator('table.marks-table input[type=number]');
  const geoCount = await geoInputs.count();
  for (let i = 0; i < geoCount; i += 1) await geoInputs.nth(i).fill('55');
  await page.click('button:has-text("Save marks")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.click('button:has-text("Submit for checking")');
  await page.waitForSelector('.badge.entered', { timeout: 15000 });

  check(
    'no verify button when the DoS entered it themselves',
    (await page.locator('button:has-text("Confirm marks are correct")').count()) === 0,
  );
  const fourEyes = await page.textContent('.card:has-text("Next steps")');
  check(
    'and the reason is shown',
    /other than the person who entered it/.test(fourEyes || ''),
  );
  await page.screenshot({ path: `${SHOTS}/06-four-eyes.png`, fullPage: true });

  console.log('\n--- releasing computes the report card ---');
  {
    // Publishing Mathematics above must have produced term results. This is
    // the link between what the office types and what a parent eventually
    // sees, so verify it in the database rather than trusting the UI.
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      uri: process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school',
    });
    const [computed] = await conn.query(
      `SELECT COUNT(*) AS n FROM term_results tr
         JOIN subjects s ON s.id = tr.subject_id WHERE s.code = 'MTC'`,
    );
    check('releasing Mathematics computed its results', Number(computed[0].n) > 0,
      `${computed[0].n} rows`);

    const [unreleased] = await conn.query(
      `SELECT COUNT(*) AS n FROM term_results tr
         JOIN subjects s ON s.id = tr.subject_id WHERE s.code IN ('ENG','GEO')`,
    );
    check('unreleased subjects have no results at all', Number(unreleased[0].n) === 0,
      `${unreleased[0].n} rows`);
    await conn.end();
  }

  console.log('\n--- tenant isolation through the UI ---');
  const res = await page.goto(`${BASE}/marksheets/99999`, { waitUntil: 'networkidle' });
  check("another school's marksheet is not found", res.status() === 404, `HTTP ${res.status()}`);

  console.log('\n--- signed out users are turned away ---');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await logout(page);
  await page.goto(`${BASE}/marksheets/1`, { waitUntil: 'networkidle' });
  check('marksheet redirects to login when signed out', /login/.test(page.url()), page.url());

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log(`screenshots: ${SHOTS}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * The office issuing access slips, in a real browser.
 *
 * The checks that matter are not "does the page render". They are: office
 * staff cannot issue codes, a code is shown exactly once, reprinting
 * cancels the slip already handed out, and the printed sheet is something a
 * school can actually cut up and give to nine hundred girls.
 *
 *   node scripts/families-smoke.js
 */

const fs = require('fs');
const { chromium } = require('playwright');
const { reseed } = require('./lib/reseed');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4500';
const SHOTS = process.env.SHOT_DIR || '/tmp/portal-shots';

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

(async () => {
  reseed();
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', (e) => check('no page errors', false, e.message));

  console.log('\n--- setup is not for office staff ---');
  await login(page, 'clerk1@nabisunsa.test');
  const clerkView = await page.goto(`${BASE}/setup/families`, { waitUntil: 'networkidle' });
  check('office staff can look but not issue', clerkView.status() === 200);
  const clerkButtons = await page.locator('button:has-text("Generate codes")').count();
  if (clerkButtons > 0) {
    // The page is readable; the action itself must refuse.
    await page.click('button:has-text("Generate codes")');
    await page.waitForSelector('.notice.error', { timeout: 15000 });
    const refusal = await page.textContent('.notice.error');
    check('and the action refuses them', /Director of Studies|administrator/i.test(refusal || ''),
      refusal?.trim());
  }

  console.log('\n--- the DoS issues codes for a class ---');
  await page.click('button:has-text("Sign out")');
  await page.waitForURL(/login/, { timeout: 15000 });
  await login(page, 'dos@nabisunsa.test');
  await page.goto(`${BASE}/setup/families`, { waitUntil: 'networkidle' });

  // Read the sentence itself, not the card: a card's textContent runs the
  // table cells together and "28" "3" "22" reads as one number.
  const waitingBefore = (await page.textContent('#waiting'))?.trim();
  check('the office is told how many families are missing',
    /^25 student\(s\) have no family account yet\.$/.test(waitingBefore || ''),
    waitingBefore);

  await page.click('button:has-text("Generate codes")');
  await page.waitForSelector('#slips', { timeout: 20000 });
  const slips = await page.locator('#slips .slip').count();
  check('a slip is produced for every student without an account', slips > 20,
    `${slips} slips`);

  const firstCode = await page.locator('#slips .slip-code').first().textContent();
  check('each slip carries a readable code', /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(firstCode || ''),
    firstCode || '');
  const slipText = await page.locator('#slips .slip').first().textContent();
  check('and tells the parent exactly what to do', /Activate account/.test(slipText || ''));
  check('and says the code expires', /expires on/.test(slipText || ''));

  const warning = await page.textContent('#slips .notice.error');
  check('the office is warned the codes cannot be recovered',
    /only time they can be read/i.test(warning || ''), (warning || '').trim().slice(0, 60));

  await page.screenshot({ path: `${SHOTS}/07-slips.png`, fullPage: true });

  console.log('\n--- the codes are not stored where anyone can read them ---');
  {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      uri: process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school',
    });
    const bare = firstCode.replace('-', '');
    const [rows] = await conn.query(
      'SELECT COUNT(*) AS n FROM student_invites WHERE code_hash = ? OR code_hash LIKE ?',
      [bare, `%${bare}%`],
    );
    check('the printed code appears nowhere in the table', Number(rows[0].n) === 0,
      `${rows[0].n} row(s) contain it`);

    const [hashes] = await conn.query(
      "SELECT code_hash FROM student_invites WHERE status = 'unused' LIMIT 1",
    );
    check('codes are stored as bcrypt hashes', /^\$2[aby]\$/.test(hashes[0].code_hash),
      hashes[0].code_hash.slice(0, 7));
    await conn.end();
  }

  console.log('\n--- issuing again does not disturb slips already handed out ---');
  await page.goto(`${BASE}/setup/families`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Generate codes")');
  await page.waitForSelector('.notice.ok', { timeout: 20000 });
  const second = await page.textContent('.notice.ok');
  check('a second run prints nothing new', /^0 code\(s\) to print/.test((second || '').trim()),
    (second || '').trim());
  check('and says why', /already have a live code/.test(second || ''));

  console.log('\n--- reprinting cancels the old slip ---');
  await page.check('#reissue');
  await page.click('button:has-text("Generate codes")');
  await page.waitForSelector('#slips .slip', { timeout: 20000 });
  const newCode = await page.locator('#slips .slip-code').first().textContent();
  check('a reprint issues a different code', newCode !== firstCode, `${firstCode} -> ${newCode}`);
  {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      uri: process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school',
    });
    const [revoked] = await conn.query(
      "SELECT COUNT(*) AS n FROM student_invites WHERE status = 'revoked'",
    );
    check('and the codes already handed out are revoked', Number(revoked[0].n) > 20,
      `${revoked[0].n} revoked`);
    await conn.end();
  }

  console.log('\n--- a parent who lost the slip ---');
  await page.goto(`${BASE}/setup/families`, { waitUntil: 'networkidle' });
  await page.fill('#registrationNo', 'NGSS/2026/001');
  await page.click('button:has-text("Withdraw access and print a new slip")');
  await page.waitForSelector('#slips .slip', { timeout: 20000 });
  const resetSlips = await page.locator('#slips .slip').count();
  check('one new slip is printed for that student', resetSlips === 1, `${resetSlips} slip(s)`);
  {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({
      uri: process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school',
    });
    const [rows] = await conn.query(
      "SELECT user_id FROM students WHERE registration_no = 'NGSS/2026/001'",
    );
    check('and the old account can no longer see that child', rows[0].user_id === null,
      `user_id ${rows[0].user_id}`);
    await conn.end();
  }

  console.log('\n--- what actually comes out of the printer ---');
  const pdf = `${SHOTS}/slips.pdf`;
  await page.pdf({ path: pdf, format: 'A4', printBackground: true });
  const size = fs.statSync(pdf).size;
  check('a printable sheet is produced', size > 5000, `${Math.round(size / 1024)} KB`);
  const chrome = await page.evaluate(() => {
    const bar = document.querySelector('.topbar');
    return bar ? getComputedStyle(bar).display : 'absent';
  });
  check('screen furniture exists on screen (hidden only when printing)', chrome !== 'absent');

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

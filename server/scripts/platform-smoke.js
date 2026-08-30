/**
 * The Midway console, in a browser.
 *
 * The console can suspend every school on the platform, so the checks here
 * are mostly about who cannot reach it. The one that matters most is the
 * third: both session systems are signed with the same secret, and what
 * keeps them apart is an audience mixed into the signed material
 * (domain/session-token.ts). That is asserted here by taking a real school
 * session and presenting it as a platform cookie, rather than by trusting
 * the comment.
 *
 *   node scripts/platform-smoke.js
 */

const fs = require('fs');
const { chromium } = require('playwright');
const { reseed } = require('./lib/reseed');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4500';
const DB = process.env.DATABASE_URL || 'mysql://root@127.0.0.1:3306/midway_school';
const SHOTS = process.env.SHOT_DIR || '/tmp/portal-shots';

// Unique per run: creating a school twice with one slug is correctly
// refused, and this suite is about creation, not about that refusal.
const RUN = Date.now().toString(36).slice(-5);
const ADMIN = { email: 'smoke-admin@midwayug.test', password: 'platform-smoke-password' };

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

/** The console's first account cannot be made through the console. */
async function ensurePlatformAdmin() {
  const mysql = require('mysql2/promise');
  const bcrypt = require('bcryptjs');
  const conn = await mysql.createConnection({ uri: DB });
  await conn.query(
    `INSERT INTO platform_users (display_name, email, password_hash, is_active)
     VALUES ('Platform Smoke', ?, ?, 1)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_active = 1,
                             password_changed_at = NULL`,
    [ADMIN.email, await bcrypt.hash(ADMIN.password, 10)],
  );
  await conn.end();
}

(async () => {
  reseed();
  await ensurePlatformAdmin();
  fs.mkdirSync(SHOTS, { recursive: true });

  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', (e) => check('no page errors', false, e.message));

  console.log('\n--- the console is not open to anyone who finds it ---');
  await page.goto(`${BASE}/platform`, { waitUntil: 'networkidle' });
  check('signed out, it redirects to its own login',
    /platform\/login/.test(page.url()), page.url());

  await page.fill('#email', 'admin@nabisunsa.test');
  await page.fill('#password', 'portal123');
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector('.notice.error', { timeout: 15000 });
  const refusal = await page.textContent('.notice.error');
  check("a school administrator's own password is refused here",
    /not recognised/i.test(refusal || ''), refusal?.trim());
  check('and the refusal does not say whether the address is known',
    !/password|no such|unknown/i.test(refusal || ''));

  console.log('\n--- a school session cannot be reused as a platform session ---');
  const school = await browser.newPage();
  await school.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await school.fill('#email', 'dos@nabisunsa.test');
  await school.fill('#password', 'portal123');
  await Promise.all([
    school.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 }),
    school.click('button[type=submit]'),
  ]);
  const schoolToken = (await school.context().cookies())
    .find((c) => c.name === 'midway_session')?.value;
  check('a real school session was obtained', !!schoolToken);

  const forged = await browser.newContext();
  await forged.addCookies([{
    name: 'midway_platform',
    value: schoolToken,
    domain: new URL(BASE).hostname,
    path: '/platform',
    httpOnly: true,
    secure: false,
  }]);
  const attacker = await forged.newPage();
  await attacker.goto(`${BASE}/platform`, { waitUntil: 'networkidle' });
  check('presented as a platform cookie, it is refused',
    /platform\/login/.test(attacker.url()), attacker.url());

  console.log('\n--- Midway signs in ---');
  await page.fill('#email', ADMIN.email);
  await page.fill('#password', ADMIN.password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ]);
  check('the console opens', /\/platform$/.test(page.url()), page.url());
  check('the schools are listed', /Nabisunsa/.test(await page.textContent('body') || ''));
  await page.screenshot({ path: `${SHOTS}/08-platform.png`, fullPage: true });

  console.log('\n--- onboarding a school, which used to need a shell ---');
  await page.goto(`${BASE}/platform/schools/new`, { waitUntil: 'networkidle' });
  await page.fill('#name', 'Seeta High School');
  await page.fill('#slug', `seeta-smoke-${RUN}`);
  await page.fill('#adminName', 'Head Teacher');
  await page.fill('#adminEmail', `head-${RUN}@seeta.test`);
  await page.fill('#adminPassword', 'a-long-enough-password');
  // By its label: the topbar's Sign out is also a submit button, and first.
  await page.click('button:has-text("Create school")');
  await page.waitForURL(/\/platform\/schools\/\d+/, { timeout: 25000 });
  const schoolUrl = page.url();
  check('the school is created', true, schoolUrl);
  await page.screenshot({ path: `${SHOTS}/09-school.png`, fullPage: true });

  const newAdmin = await browser.newPage();
  await newAdmin.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await newAdmin.fill('#email', `head-${RUN}@seeta.test`);
  await newAdmin.fill('#password', 'a-long-enough-password');
  await Promise.all([
    newAdmin.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 }),
    newAdmin.click('button[type=submit]'),
  ]);
  check('its administrator can sign into the school portal', !/login/.test(newAdmin.url()));
  const theirs = await newAdmin.textContent('body');
  check('and sees their own school and not another',
    /Seeta/.test(theirs || '') && !/Nabisunsa/.test(theirs || ''));

  console.log('\n--- suspending a school actually stops it ---');
  await page.goto(schoolUrl, { waitUntil: 'networkidle' });
  await page.selectOption('select[name=status]', 'suspended');
  await page.fill('input[name=reason]', 'Smoke test — unpaid');
  await page.click('button:has-text("Change to suspended")');
  await page.waitForTimeout(2500);

  const blocked = await browser.newPage();
  await blocked.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await blocked.fill('#email', `head-${RUN}@seeta.test`);
  await blocked.fill('#password', 'a-long-enough-password');
  await blocked.click('button[type=submit]');
  await blocked.waitForSelector('.notice.error', { timeout: 15000 }).catch(() => {});
  check('a suspended school cannot sign in at all', /login/.test(blocked.url()), blocked.url());

  console.log('\n--- a suspension is recorded, not just applied ---');
  {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({ uri: DB });
    const [rows] = await conn.query(
      `SELECT detail FROM audit_log WHERE action LIKE '%status%' ORDER BY id DESC LIMIT 1`,
    );
    check('the reason is written to the audit log',
      /unpaid/i.test(rows[0]?.detail || ''), (rows[0]?.detail || '').slice(0, 80));
    await conn.end();
  }

  console.log('\n--- changing a password ends the other sessions ---');
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(`${BASE}/platform/login`, { waitUntil: 'networkidle' });
  await otherPage.fill('#email', ADMIN.email);
  await otherPage.fill('#password', ADMIN.password);
  await Promise.all([
    otherPage.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 }),
    otherPage.click('button:has-text("Sign in")'),
  ]);
  check('a second session is open', /\/platform$/.test(otherPage.url()));

  await page.goto(`${BASE}/platform/account`, { waitUntil: 'networkidle' });
  await page.fill('#current', ADMIN.password);
  await page.fill('#next', 'a-different-long-password');
  await page.fill('#confirmation', 'a-different-long-password');
  await page.click('button:has-text("Change password")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  check('the session that made the change survives', !/login/.test(page.url()), page.url());

  await otherPage.goto(`${BASE}/platform`, { waitUntil: 'networkidle' });
  check('the other session is signed out',
    /platform\/login/.test(otherPage.url()), otherPage.url());

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

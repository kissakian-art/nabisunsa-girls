/**
 * Report cards in a real browser, including the printed output.
 *
 * The card is what a school signs and hands to a parent, so the checks are:
 * it never shows an unreleased mark, every student gets a card even with
 * nothing released, and the print view actually paginates.
 *
 *   node scripts/report-smoke.js
 */

const { chromium } = require('playwright');
const fs = require('fs');
const { reseed } = require('./lib/reseed');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4500';
const SHOTS = process.env.SHOT_DIR || '/tmp/portal-shots';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

(async () => {
  // Start from known data: the suites share a database and change it.
  reseed();
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.on('pageerror', (e) => check('no page errors', false, e.message));

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', 'dos@nabisunsa.test');
  await page.fill('#password', 'portal123');
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 }),
    page.click('button[type=submit]'),
  ]);

  console.log('\n--- choose a class ---');
  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
  check('the office can reach report cards',
    (await page.locator('h1:has-text("Report cards")').count()) === 1);

  await page.locator('tbody a:has-text("Open")').first().click();
  await page.waitForURL(/classId=/, { timeout: 15000 });
  // #class-summary, not `.card:has-text(...)`: the class chooser above also
  // contains the class name, and matched first.
  const summary = await page.textContent('#class-summary');
  check('the class summary names how many have results',
    /of \d+ students have released results/.test(summary || ''),
    (summary || '').match(/\d+ of \d+ students[^.]*\./)?.[0]);
  await page.screenshot({ path: `${SHOTS}/20-reports-class.png`, fullPage: true });

  console.log('\n--- one card ---');
  await page.locator('a.student-card-link').first().click();
  await page.waitForSelector('.report', { timeout: 15000 });

  const cardText = await page.textContent('.report');
  check('the card names the school', /Nabisunsa/.test(cardText || ''));
  check('the card names the term', /Term 3 2026/.test(cardText || ''));
  check('the card shows the released subjects',
    /Biology/.test(cardText || '') && /History/.test(cardText || ''));
  check('unreleased subjects are absent from the card',
    !/Mathematics/.test(cardText || '') && !/Geography/.test(cardText || ''),
    'Mathematics and Geography are still draft');
  check('the card shows a position in class',
    /Position in class/.test(cardText || ''));
  check('the card has signature lines',
    /Director of Studies/.test(cardText || '') && /Parent \/ Guardian/.test(cardText || ''));
  await page.screenshot({ path: `${SHOTS}/21-report-card.png`, fullPage: true });

  console.log('\n--- printed output ---');
  await page.goto(`${BASE}/reports`, { waitUntil: 'networkidle' });
  await page.locator('tbody a:has-text("Open")').first().click();
  await page.waitForURL(/classId=/, { timeout: 15000 });
  await page.locator('a:has-text("Open all")').click();
  await page.waitForSelector('.report', { timeout: 15000 });

  const cards = await page.locator('.report').count();
  check('every student in the class gets a card', cards === 28, `${cards} cards`);

  const empties = await page.locator('.report-empty').count();
  check('students with nothing released still get a card, marked as such',
    empties > 0, `${empties} empty card(s)`);

  // Print emulation: the office furniture must not reach the paper.
  await page.emulateMedia({ media: 'print' });
  const barVisible = await page.locator('.no-print').first().isVisible().catch(() => false);
  check('screen-only controls are hidden when printing', barVisible === false);

  const pdf = `${SHOTS}/22-report-cards.pdf`;
  await page.pdf({ path: pdf, format: 'A4', printBackground: true });
  const bytes = fs.statSync(pdf).size;
  check('a printable PDF is produced', bytes > 10000, `${Math.round(bytes / 1024)} KB`);

  // One card per page: 28 students should not fit on a handful of sheets.
  const pageCount = fs.readFileSync(pdf).toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  check('cards are paginated one per page', pageCount >= 28, `${pageCount} pages`);

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

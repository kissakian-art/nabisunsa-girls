/**
 * The family app in a real browser, against a real server.
 *
 * Web is not the shipping target, but it is the same React tree the phone
 * runs, so it catches the things that matter: does a parent get in, does she
 * see her own child's released marks and nothing else.
 */
const fs = require('fs');
const { chromium } = require('playwright');
const { reseed } = require('./lib/reseed');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = 'http://127.0.0.1:8081';
const SHOTS = '/tmp/app-shots';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

(async () => {
  // Activation consumes the demo slip, so a second run without this would
  // fail on a code that was valid an hour ago.
  reseed();
  fs.mkdirSync(SHOTS, { recursive: true });
  // Web is a test harness, not the product, and it needs one concession the
  // phone does not: the app is served from :8081 and the API from :4500, so
  // the browser applies CORS to every call. A native app has no origin and
  // no preflight, so rather than loosening the API for something only this
  // test hits, the test browser is told to stand down.
  const browser = await chromium.launch({
    ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
    args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`));

  console.log('\n--- sign in ---');
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Sign in', { timeout: 60000 });
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
  check('the login screen is branded for the school',
    await page.locator("text=NABISUNSA GIRLS' SECONDARY SCHOOL").count() > 0);
  check('and points staff at the portal',
    await page.locator('text=School staff sign in on the school portal').count() > 0);
  check('and offers the slip route for a first-time parent',
    await page.locator('[data-testid=go-activate]').count() > 0);

  const inputs = page.locator('input');
  await inputs.nth(0).fill('parent1@nabisunsa.test');
  await inputs.nth(1).fill('portal123');
  // By testID, not by text: "Sign in" is also the card's title, and
  // clicking that does nothing at all.
  await page.locator('[data-testid=sign-in]').click();

  console.log('\n--- the dashboard ---');
  await page.waitForSelector('[data-testid=report-card]', { timeout: 60000 });
  await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });
  const body = await page.textContent('body');

  check('the parent is greeted by name', /Nakato/.test(body || ''));
  check('the term is named', /Term 3 2026/.test(body || ''));
  check('an average is shown', /average/i.test(body || ''));
  check('released subjects are listed', /Biology/.test(body || '') && /History/.test(body || ''));
  check('unreleased subjects are not', !/English Language/.test(body || ''),
    /English Language/.test(body || '') ? 'English leaked' : '');
  check('the app is three tabs, not seven screens',
    /Home/.test(body || '') && /Report card/.test(body || '') && /Advisor/.test(body || ''));
  check('the learning-management tabs are gone',
    !/Classroom/.test(body || '') && !/Career JAB/.test(body || ''));
  check('a parent with two daughters gets a picker',
    (await page.locator('text=Aisha').count()) > 0 && (await page.locator('text=Brenda').count()) > 0);

  check('what the school has said reaches the dashboard',
    /From the school/.test(body || '') && /Visiting day is Saturday/.test(body || ''));

  console.log('\n--- the other daughter ---');
  const secondChildId = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('[data-testid^=child-]'))
      .find((n) => n.textContent.includes('Brenda'));
    return el ? el.getAttribute('data-testid') : null;
  });
  await page.locator(`[data-testid="${secondChildId}"]`).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/03-second-child.png`, fullPage: true });
  const second = await page.textContent('body');
  check('switching child changes the registration number',
    /NGSS\/2026\/002/.test(second || ''),
    (second || '').match(/NGSS\/2026\/\d+/)?.[0]);

  console.log('\n--- the report card ---');
  await page.locator('[data-testid=report-card]').click();
  await page.waitForSelector('[data-testid=report-card-screen]', { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/04-report-card.png`, fullPage: true });
  const card = await page.textContent('body');
  check('the card carries the school and the student', /NABISUNSA/.test(card || ''));
  check('it totals an average', /Average/.test(card || ''));
  check('it shows coursework, exam and final columns',
    /C\/W/.test(card || '') && /Exam/.test(card || '') && /Final/.test(card || ''));
  check('and says what it is not', /official record/.test(card || ''));

  console.log('\n--- the advisor ---');
  await page.locator('[data-testid=back]').click();
  await page.waitForSelector('[data-testid=advisor]', { timeout: 30000 });
  await page.locator('[data-testid=advisor]').click();
  await page.waitForSelector('text=Academic advisor', { timeout: 30000 });
  await page.screenshot({ path: `${SHOTS}/05-advisor.png`, fullPage: true });
  const chat = await page.textContent('body');
  check('the advisor opens on the chosen child', /Brenda/.test(chat || ''));
  check('no provider is advertised to the parent', !/Gemini/i.test(chat || ''));

  console.log('\n--- activation from a printed slip ---');
  const fresh = await browser.newPage({ viewport: { width: 420, height: 900 } });
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto(APP, { waitUntil: 'networkidle' });
  await fresh.waitForSelector('[data-testid=go-activate]', { timeout: 60000 });
  await fresh.locator('[data-testid=go-activate]').click();
  await fresh.waitForSelector('text=Activate your account', { timeout: 30000 });
  await fresh.screenshot({ path: `${SHOTS}/06-activate.png`, fullPage: true });

  // By testID: the login screen stays mounted behind this one, so "the
  // first input on the page" is its hidden email field.
  await fresh.locator('[data-testid=reg-no]').fill('NGSS/2026/004');
  // Typed exactly as printed, hyphen and lower case included.
  await fresh.locator('[data-testid=code]').fill('par-ent');
  await fresh.locator('[data-testid=new-password]').fill('kampala2026');
  await fresh.locator('[data-testid=activate]').click();
  await fresh.waitForSelector('[data-testid=report-card]', { timeout: 60000 });
  const activated = await fresh.textContent('body');
  check('a printed slip signs the parent straight in', /Full report card/.test(activated || ''));
  check('and shows that child', /NGSS\/2026\/004/.test(activated || ''),
    (activated || '').match(/NGSS\/2026\/\d+/)?.[0]);
  await fresh.screenshot({ path: `${SHOTS}/07-activated.png`, fullPage: true });

  check('no uncaught errors anywhere in the run', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log(`screenshots: ${SHOTS}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

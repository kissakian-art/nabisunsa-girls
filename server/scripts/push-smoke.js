/**
 * Announcements and push, end to end.
 *
 * Real notifications go to Expo's push service, which this environment
 * cannot reach — and which would be the wrong thing to hit from a test
 * anyway. So the suite stands a fake push service in front of the server
 * (EXPO_PUSH_URL) and inspects exactly what would have been sent.
 *
 * That is the part worth testing. Not "does Expo work", but: does a release
 * reach the right families and nobody else, and does a notification ever
 * carry a mark.
 *
 *   node scripts/push-smoke.js
 */

const http = require('http');
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

/** Stands in for exp.host and remembers what it was asked to deliver. */
function fakePushService(port) {
  const sent = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let messages = [];
      try { messages = JSON.parse(body); } catch { /* recorded as empty */ }
      sent.push(...messages);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: messages.map(() => ({ status: 'ok' })) }));
    });
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ sent, close: () => server.close() }));
  });
}

const post = (path, body, token) =>
  fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

const get = (path, token) =>
  fetch(`${BASE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

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

  const push = await fakePushService(4599);
  const fs = require('fs');
  const browser = await chromium.launch(
    fs.existsSync(CHROME) ? { executablePath: CHROME } : {},
  );
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

  console.log('\n--- a phone registers itself ---');
  const parent = await (await post('/api/auth/login', {
    email: 'parent1@nabisunsa.test', password: 'portal123', school: 'nabisunsa-girls',
  })).json();

  const junk = await post('/api/devices', { token: 'not-a-token' }, parent.token);
  check('junk is not accepted as a push token', junk.status === 400, `HTTP ${junk.status}`);

  const registered = await post(
    '/api/devices',
    { token: 'ExponentPushToken[test-parent-one]', platform: 'android' },
    parent.token,
  );
  check('a phone registers', registered.status === 200, `HTTP ${registered.status}`);

  const anon = await post('/api/devices', { token: 'ExponentPushToken[nobody]' });
  check('an unauthenticated phone cannot register', anon.status === 401, `HTTP ${anon.status}`);

  // A second family, so "only the right people are told" can be checked.
  const other = await (await post('/api/auth/login', {
    email: 'parent2@nabisunsa.test', password: 'portal123', school: 'nabisunsa-girls',
  })).json();
  await post('/api/devices',
    { token: 'ExponentPushToken[test-parent-two]', platform: 'android' }, other.token);

  console.log('\n--- releasing marks tells the families ---');
  await login(page, 'dos@nabisunsa.test');
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const row = page.locator('tr', { has: page.locator('td:text-is("Chemistry")') }).first();
  await row.locator('a:has-text("Open")').click();
  await page.waitForURL(/\/marksheets\/\d+/, { timeout: 15000 });
  page.once('dialog', (d) => d.accept());
  await page.click('button:has-text("Release to parents")');
  await page.waitForSelector('.badge.published', { timeout: 15000 });

  // The push is fired after the release is saved, so give it a moment.
  await page.waitForTimeout(2000);

  const results = push.sent.filter((m) => m.data?.screen === 'results');
  check('both families with a daughter in that class are told', results.length === 2,
    `${results.length} notification(s)`);
  check('the subject is named', /Chemistry/.test(results[0]?.title || ''),
    results[0]?.title);

  // The rule that matters most on this screen.
  const anyMark = push.sent.some((m) => /\b\d{2,3}\s*%|\bscored|\bgrade\b|\bposition\b/i.test(
    `${m.title} ${m.body}`,
  ));
  check('no notification carries a mark, a grade or a position', !anyMark,
    push.sent.map((m) => m.body).join(' | ').slice(0, 90));

  const anyName = push.sent.some((m) => /Aisha|Brenda|Cynthia/.test(`${m.title} ${m.body}`));
  check("and no child's name appears on a lock screen", !anyName);

  console.log('\n--- an announcement to one class ---');
  const before = push.sent.length;
  await page.goto(`${BASE}/announcements`, { waitUntil: 'networkidle' });
  await page.fill('#title', 'Visiting day moved to Saturday');
  await page.fill('#body',
    'Visiting day has moved to Saturday 12th. Parents should arrive from 10am. '
    + 'Please bring the report card slip issued last term.');
  await page.selectOption('#audience', 'class');
  await page.click('button:has-text("Save as draft")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });

  const draftNotice = await page.textContent('.notice.ok');
  check('it is saved as a draft first', /draft/i.test(draftNotice || ''), draftNotice?.trim());
  check('and nothing has been sent yet', push.sent.length === before,
    `${push.sent.length - before} sent`);

  page.once('dialog', (d) => d.accept());
  await page.click('button:has-text("Send to parents")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const notes = push.sent.slice(before);
  check('the families are notified', notes.length === 2, `${notes.length} notification(s)`);
  check('the title is the school\'s own words',
    notes[0]?.title === 'Visiting day moved to Saturday', notes[0]?.title);
  check('the phone gets the first sentence, not the whole notice',
    notes[0]?.body === 'Visiting day has moved to Saturday 12th.', notes[0]?.body);

  console.log('\n--- and the family can read it in the app ---');
  const feed = await (await get('/api/announcements', parent.token)).json();
  // By title, not by position: the demo school is seeded with an
  // announcement of its own, and asserting on a count made this suite
  // depend on that.
  const mine = feed.announcements.find((a) => a.title === 'Visiting day moved to Saturday');
  check('the announcement reaches the app', !!mine,
    feed.announcements.map((a) => a.title).join(' | '));
  check('with the full text, not the summary', /report card slip/.test(mine?.body || ''));

  console.log('\n--- a draft is not visible to anyone ---');
  await page.goto(`${BASE}/announcements`, { waitUntil: 'networkidle' });
  await page.fill('#title', 'Unsent test notice');
  await page.fill('#body', 'This one is never sent.');
  await page.click('button:has-text("Save as draft")');
  await page.waitForSelector('.notice.ok', { timeout: 15000 });
  const feedAgain = await (await get('/api/announcements', parent.token)).json();
  check('an unsent draft never reaches a parent',
    !feedAgain.announcements.some((a) => a.title === 'Unsent test notice'));

  console.log('\n--- signing out retires the phone ---');
  await post('/api/devices', { token: 'ExponentPushToken[test-parent-one]' }, parent.token);
  const removed = await fetch(
    `${BASE}/api/devices?token=${encodeURIComponent('ExponentPushToken[test-parent-one]')}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${parent.token}` } },
  );
  check('the device is retired', removed.status === 200, `HTTP ${removed.status}`);
  {
    const mysql = require('mysql2/promise');
    const conn = await mysql.createConnection({ uri: DB });
    const [rows] = await conn.query(
      "SELECT is_active FROM push_devices WHERE expo_token = 'ExponentPushToken[test-parent-one]'",
    );
    check('and stops receiving', Number(rows[0].is_active) === 0);
    await conn.end();
  }

  await browser.close();
  push.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });

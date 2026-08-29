/**
 * End-to-end test of the mobile API against a running server.
 *
 * The checks that matter are not "does it return JSON". They are:
 *   - a family sees only its own children,
 *   - a parent cannot reach another family's child by changing an id,
 *   - school staff cannot sign into the family app,
 *   - unreleased marks never appear.
 *
 *   node scripts/api-smoke.js
 */

const { reseed } = require('./lib/reseed');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4500';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
};

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
  fetch(`${BASE}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

(async () => {
  // Start from known data: the suites share a database and change it.
  reseed();

  console.log('\n--- sign in ---');
  const bad = await post('/api/auth/login', {
    email: 'parent1@nabisunsa.test',
    password: 'wrong',
  });
  check('wrong password is refused', bad.status === 401, `HTTP ${bad.status}`);
  const badBody = await bad.json();
  check(
    'refusal does not say whether the account exists',
    !/password|no such|unknown/i.test(badBody.error || ''),
    badBody.error,
  );

  const staff = await post('/api/auth/login', {
    email: 'dos@nabisunsa.test',
    password: 'portal123',
  });
  check('school staff cannot sign into the family app', staff.status === 401,
    `HTTP ${staff.status}`);

  const login = await post('/api/auth/login', {
    email: 'parent1@nabisunsa.test',
    password: 'portal123',
  });
  check('a parent can sign in', login.status === 200, `HTTP ${login.status}`);
  const { token } = await login.json();
  check('a token is issued', typeof token === 'string' && token.includes('.'));

  console.log('\n--- who am I ---');
  const anon = await get('/api/me');
  check('no token is refused', anon.status === 401, `HTTP ${anon.status}`);

  const forged = await get('/api/me', `${token.split('.')[0]}.forgedsignature`);
  check('a forged signature is refused', forged.status === 401, `HTTP ${forged.status}`);

  const me = await get('/api/me', token);
  check('profile loads', me.status === 200, `HTTP ${me.status}`);
  const profile = await me.json();
  check('the school is named for branding', !!profile.school?.name, profile.school?.name);
  check(
    'a parent with two daughters sees both',
    profile.children.length === 2,
    `${profile.children.length} children`,
  );

  console.log('\n--- results ---');
  const res = await get('/api/results', token);
  check('results load without parameters', res.status === 200, `HTTP ${res.status}`);
  const payload = await res.json();
  check('the current term is chosen by default', !!payload.term?.name, payload.term?.name);
  check('released subjects are returned', payload.results.length > 0,
    `${payload.results.length} subjects`);

  const subjects = payload.results.map((r) => r.subjectName).sort();
  check(
    'only released subjects appear',
    !subjects.includes('English Language') && !subjects.includes('Geography'),
    subjects.join(', '),
  );

  const first = payload.results[0];
  check('each result carries a grade and a position',
    first.grade != null && first.position != null,
    `${first.subjectName}: ${first.finalScore} ${first.grade}, position ${first.position} of ${first.groupSize}`);

  console.log('\n--- the academic advisor ---');
  {
    const anonAsk = await post('/api/advisor', { message: 'hello' });
    check('the advisor refuses an unauthenticated question', anonAsk.status === 401,
      `HTTP ${anonAsk.status}`);

    const empty = await post('/api/advisor', { message: '   ' }, token);
    check('an empty question is refused', empty.status === 400, `HTTP ${empty.status}`);

    const huge = await post('/api/advisor', { message: 'x'.repeat(5000) }, token);
    check('an oversized question is refused', huge.status === 400, `HTTP ${huge.status}`);

    // Without GEMINI_API_KEY the route must say so cleanly rather than crash
    // or, worse, fall back to a key shipped in the app.
    const ask = await post('/api/advisor', { message: 'How can I improve?' }, token);
    const askBody = await ask.json();
    if (process.env.GEMINI_API_KEY) {
      check('the advisor answers', ask.status === 200 && typeof askBody.reply === 'string',
        `HTTP ${ask.status}`);
    } else {
      check('an unconfigured advisor fails cleanly', ask.status === 503, `HTTP ${ask.status}`);
      check('and never leaks provider detail',
        !/api[_ ]?key|quota|gemini/i.test(askBody.error || ''), askBody.error);
    }
  }

  console.log('\n--- a family cannot reach another family\'s child ---');
  const other = await post('/api/auth/login', {
    email: 'parent2@nabisunsa.test',
    password: 'portal123',
  });
  const otherToken = (await other.json()).token;
  const otherProfile = await (await get('/api/me', otherToken)).json();
  const otherChildId = otherProfile.children[0].id;
  const ownChildIds = profile.children.map((c) => c.id);

  check('the two families have different children',
    !ownChildIds.includes(otherChildId), `other child id ${otherChildId}`);

  const crossed = await get(`/api/results?studentId=${otherChildId}`, token);
  check("another family's child is not found", crossed.status === 404,
    `HTTP ${crossed.status}`);

  const notMine = await get('/api/results?studentId=999999', token);
  check('an unknown student id is not found', notMine.status === 404,
    `HTTP ${notMine.status}`);

  // Their own second child must still work, to prove the check is
  // "is this mine" and not "only ever the first one".
  const secondChild = await get(`/api/results?studentId=${ownChildIds[1]}`, token);
  check('their own second child is reachable', secondChild.status === 200,
    `HTTP ${secondChild.status}`);
  const secondPayload = await secondChild.json();
  check('and returns that child, not the first',
    secondPayload.child.id === ownChildIds[1]);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

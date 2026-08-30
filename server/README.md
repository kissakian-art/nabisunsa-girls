# School platform server

The multi-tenant backend and Director of Studies portal. Deploys to the
existing VPS as one more Caddy-fronted container alongside midway, efris,
hires and books.

```
server/
  db/migrations/001_init.sql   authoritative schema (MySQL 8.0)
  db/tenant.ts                 tenant-scoped data access
  domain/marks.ts              term mark computation
  domain/marksheet.ts          the DoS workflow state machine
```

## Decisions worth knowing

**MySQL 8.0 is the target, not MariaDB.** The production database is the
`mysql:8.0` container in `/opt/infra`; MariaDB was only ever the dev
database. `DEPLOYMENT_HANDOFF §3` records `prisma migrate deploy` breaking on
MySQL with MariaDB-authored migrations, and the first draft of this schema
repeated that mistake — it applied on MariaDB 10.11 and failed on MySQL 8.0,
which forbids `CASCADE`/`SET NULL` on a column a stored generated column
depends on. **Develop against MySQL 8.0.**

**SQL migrations are the source of truth, not an ORM.** The schema uses CHECK
constraints and composite keys that Prisma cannot fully express, and owning
the DDL directly avoids the migrate-vs-push problem that bit YourHires.

**No NULL tenancy anywhere.** A `UNIQUE` key containing a nullable
`school_id` silently permits duplicates, because NULL never equals NULL —
this was a real bug caught by testing. The national curriculum catalogue
(`subject_catalog`) and Midway's own staff (`platform_users`) therefore get
their own tables rather than NULL-school rows.

**Tenant scoping is structural, not a convention.** See `db/tenant.ts`. A
caller holds a `TenantDb` bound to one school; it injects `school_id` itself
and has no method that runs an unscoped query. Cross-tenant work requires
reaching for `PlatformDb` explicitly, so it is visible in review. This is
also why the data layer is not Prisma: omitting `where: { schoolId }` there
is a silent, valid query, and that is the one failure this platform cannot
afford.

**Teachers are not users of this system.** The proposal promises schools that
teachers do nothing differently — same paper marksheets, handed to the DoS.
`domain/marksheet.ts` enforces that: teachers have no permitted action, and
appear only as `submitted_by_teacher_id`, recording whose paper sheet a
marksheet came from.

**The DoS is an office, not a person.** The Director of Studies leads a team
who do the actual transcription, so there are two roles: `dos_staff` may
enter and correct marks, and `dos` may additionally verify, publish and
withdraw. The clerk who types a mark is not the person who decides it reaches
900 parents; release authority stays with the DoS, who is accountable for it.

**Nothing reaches a parent until the school publishes it.** Also a written
promise. Marksheets move `draft → entered → verified → published`, and
`isVisibleToParents` returns true for exactly one of those. Verification must
be done by someone other than whoever entered the sheet — marks are
transcribed from paper by hand, and a second reader is all that stands
between a typo and a parent seeing the wrong mark for their child.

**Every school-specific rule is configuration.** Grading scale, the
coursework/exam split, the best-of-N rule, terms, assessment types,
combinations and their entry requirements. Nabisunsa's 20/80 and "best 3"
are data, not code — the tests prove the same marks produce different results
under a second school's configuration.

## Running the tests

Domain logic needs nothing:

```bash
npx jest server/domain
```

The tenant isolation tests need a real MySQL 8.0, and skip without one. They
rebuild the schema from `001_init.sql`, so they test the DDL that ships:

```bash
TEST_DATABASE_URL='mysql://root@127.0.0.1:3306/midway_test' npx jest server/db
```

They create two schools and try to read, update and delete across the
boundary — the checks that cannot be made by reading code.

## Onboarding a school

`/setup` is the checklist a school works through: classes and streams,
subjects, class lists, then marksheets. `node scripts/setup-smoke.js` proves
it end to end — it creates a school with nothing but a login and drives the
browser until marksheets are ready to fill in, without a line of SQL.

Two decisions worth knowing:

**Students are pasted, not typed.** Nobody enters nine hundred names one at a
time, so the import takes comma or tab separated rows straight from a
spreadsheet. A bad row is reported with its line number and the rest still
import — losing 200 good rows to one typo would be worse than useless. A
registration number already on the roll is skipped, so re-pasting an updated
list adds only the new students.

**Marksheets are generated, not created.** A school with six classes, three
streams, twelve subjects and four assessments needs 864 of them. Generation
skips classes with no students, and leaves existing sheets untouched, so
running it again after adding a subject only fills the gaps.

Setup is administration: only the DoS and school administrators see it. Office
staff enter marks, they do not configure the school.

## The Midway console

`/platform` is Midway's own area: creating schools, suspending one that stops
paying, and the platform's own staff. It is a separate login from every
school's, backed by a separate table.

**Both session types are signed with the same secret, and what keeps them
apart is cryptographic rather than a field check.** The audience is mixed
into the signed material (`domain/session-token.ts`), so a school token
presented to the console fails the signature comparison — not a condition
somebody could forget to write. `npm run smoke:platform` proves it by taking
a real school session and presenting it as a platform cookie.

**A console session is checked against the account on every request**, unlike
a school session. Signed tokens cannot be withdrawn, so without that read,
deactivating an administrator or changing a password would leave any open
session working for its full four hours — which is exactly the window that
matters, because the reason for doing either is usually that someone else has
the credentials.

**Nothing here sets anybody else's password.** Changing your own asks for the
current one even though you are already signed in, so a session left open on
an unlocked laptop is not enough to lock its owner out of the platform.

## Deploying

`ops/DEPLOY.md` is the runbook — every command, in order, for a server you
paste into rather than reason about. `bash ops/deploy-school.sh` from your PC
is the whole deploy: one SSH connection carrying one tar stream, because a
deploy that looped scp/ssh once got the source IP filtered off port 22.

Three things exist because the first deploy would otherwise fail in ways that
are hard to see from the outside:

**`ops/migrate.sh`** applies migrations against a ledger table. The old
instruction was "run 001_init.sql", which silently stopped being the whole
schema the moment there was an 002. Re-running is a no-op, so it is safe to
run after every deploy.

**`scripts/bootstrap-school.js`** creates the first school and its
administrator. Nothing else can: `/setup` needs a session, and there is no
account to sign in with on a fresh database. It is plain JavaScript, not
TypeScript, because it runs inside the container where there is no build
toolchain — and the image installs `mysql2` and `bcryptjs` separately for it,
since Next's standalone output bundles what the app imports and leaves a
plain `require` with nothing to find.

**`/api/health`** answers the question `docker ps` cannot: the app is up,
the database is reachable, the schema is applied, and the session secret is
set. The usual first-deploy failure is a container that starts perfectly and
cannot reach MySQL. It reports yes or no per check and never the reason — a
public endpoint that says `Access denied for user 'school'@'172.18.0.4'` is a
free map of the inside.

## Applying the schema

On a server, use the runner — it keeps a ledger and applies only what is new:

```bash
bash /opt/apps/school/ops/migrate.sh
```

By hand, for a local database:

```bash
docker exec -i mysql mysql -uroot -p -e 'CREATE DATABASE midway_school'
for f in server/db/migrations/*.sql; do
  docker exec -i mysql mysql -uroot -p midway_school < "$f"
done
```

`002` loads the national subject catalogue — shared reference data every
school is seeded from, maintained once centrally.

Removing a tenant is an ordered operation, not `DELETE FROM schools`: see
`scripts/lib/teardown.js` for why, and use `deleteSchoolBySlug`.

Use a `_dev` database name until the portal is deployed; nothing the live
apps touch should be involved.

## Notifications

The proposal sells this as "a direct line to every parent's phone, with no
cost per message" — the thing that replaces the SMS bill. Two events produce
one:

- **A marksheet is released.** Every family with a daughter in that class is
  told, immediately, by `lib/marksheets.ts` after the release is saved.
- **An announcement is sent.** `/announcements` — written as a draft, sent as
  a separate act, because something on 900 phones cannot be recalled.

**A notification never carries a mark, a grade, a position, or a child's
name.** It appears on a lock screen, which is visible to whoever is holding
the phone — a sibling, a boda rider, anyone in the room. "Chemistry results
released" is the message; the mark itself is behind the password. The push
suite asserts this rather than trusting it.

**Sending can never fail the school's work.** The release is saved and the
results recomputed first; the push is fired afterwards and its failure is
logged, not raised. A DoS must never be unable to publish because a push
service is down.

Delivery is Expo's push service, which reaches Android through Firebase Cloud
Messaging — so each branded build needs that school's `google-services.json`.
That is the only thing Firebase is still used for.

    npm run smoke:push

It stands a fake push service in front of the server (`EXPO_PUSH_URL`) and
inspects what would have been sent. In this container that also needs
`NO_PROXY=127.0.0.1,localhost`, or the runtime routes even a localhost fetch
through the egress proxy and it comes back 403.

## Report cards

`/reports` picks a class and term; `/reports/[studentId]` is one card and
`/reports/print` is every card for a class, one per printed page. Screen
furniture is hidden under `@media print`, so the first sheet is not wasted on
a navigation bar.

Cards read only from `term_results`, so a card can never show a mark the
school has not released. **Every student on the roll gets a card**, including
those with nothing published — it says so plainly, because a card missing
from a stack of forty is worse than an honest empty one: nobody can tell
whether it was lost.

Overall position is computed at read time rather than stored: it depends on
which subjects a student sat, and would go stale the moment another subject
is released. Ties share a position, and a student with nothing released has
no position rather than coming last.

`node scripts/report-smoke.js` checks all of that in a browser and renders
the print view to PDF to confirm it paginates one card per page.

## The app

Three screens, all reading from this server: what she is doing this term,
the full report card, and the academic advisor. Nothing else — and nothing
that asks a teacher to do anything.

The app that this replaced also carried a learning management system: a
Classroom tab, a Career tab, lesson pages, assignment posting. That was cut.
It contradicted the promise the school is buying — "your teachers do nothing
differently, they keep handing in paper" — and it was the fastest way for a
head teacher to conclude the opposite. It had also stopped working: those
screens identified the signed-in user through Firebase Auth, which nothing
signs into any more.

Firebase is gone from the app entirely. Authentication, marks, school data
and the advisor all come from here. The one remaining Firebase dependency is
outside the code: Android push is delivered through Firebase Cloud
Messaging, so each branded build needs that school's `google-services.json`.

## Family accounts

A parent cannot sign into the app until the school gives them a way in, and
nine hundred of them cannot be created by hand. `/setup/families` is that
step: pick a class, generate a code per student, print the slips, hand them
out with the report cards.

**The code is printed once and stored as a bcrypt hash.** A stolen copy of
`student_invites` must not be a list of nine hundred working credentials, so
the codes exist in readable form only in the response that created them —
the screen says so before the button is pressed, and reprinting revokes the
slips already handed out. Reissuing for a class skips students who already
have a live code, so "print for the twelve who lost theirs" does not
invalidate the other 200 slips.

**The alphabet excludes both halves of every confusable pair** — no O and no
0, no I, 1 or L, no S or 5 — and the code is printed in two groups of three.
A parent reads it off paper, in a corridor, possibly in a hurry. Normalising
what they typed strips case, spaces and the hyphen, and deliberately guesses
at nothing else: folding a typed "0" onto "O" could turn a wrong code into a
different valid one.

**No refusal says whether a student exists.** Anyone can download the app,
and "no such registration number" would let a stranger check whether a
particular child attends the school. The one exception is a code that has
already been used, which is worth saying because the next step is different
— a password reset rather than a retry — and gives nothing away.

**The office cannot read or set a family password.** Staff who could would be
able to sign in as a parent and read her daughter's marks. A forgotten
password is handled by withdrawing that account's access to the child and
printing a new slip.

**Sign-in takes a phone number or an email address.** Most families here have
the first and not the second. A phone number is unique only within a school,
so the app sends its own school slug with it — a branded build always knows
which school it is.

    npm run smoke:families

Drives the whole thing in a browser: staff cannot issue, codes are hashed,
reprinting revokes, and the printed sheet is checked as a PDF.

## Mobile API

The family app authenticates with a bearer token — the same signed payload
the portal uses in a cookie, so there is one signing key and one expiry
check rather than a second auth path to keep correct.

```
POST /api/auth/login   { email, password } -> { token, expiresAt, user }
GET  /api/me                               -> { user, school, children }
GET  /api/results?studentId=&termId=       -> { child, term, terms, results }
```

**Each surface admits only its own roles.** School staff signing into the
family app are refused exactly as an unknown user would be, and a parent
cannot sign into the portal. A portal token presented to the API is rejected
too, so a staff session cannot browse family endpoints.

**A family can only ever see its own children.** The student is never taken
from the request: it is looked up from the signed token against
`students.user_id`, so changing an id in a URL reaches nothing. Another
family's child returns 404 rather than 403 — confirming a student exists
would itself leak something. `students.user_id` may repeat, so a parent with
two daughters at the school sees both from one account.

**A school that stops paying is switched off here, not in the app.**
`schools.status` gates every endpoint that carries a child's marks: a
`suspended` or `closed` school gets 403 with the school's own reason, and the
app shows its lock screen. It has to be enforced on the server — an app can
be patched and an old APK kept installed, so a switch the client evaluates is
not a switch at all. `PlatformDb.forSchool` already refuses a suspended
school; the mobile API constructs its `TenantDb` from the token instead, so
it checks explicitly (`schoolState` in `lib/api.ts`).

`/api/me` is the one endpoint a suspended school still gets an answer from.
Without it the app cannot tell a parent why it has gone quiet, and a silent
app becomes a complaint to the head teacher rather than a renewal.

**Unreleased marks cannot appear.** Everything comes from `term_results`,
which by construction only ever contains marks the school has released.
There is no filter to forget.

### The academic advisor

`POST /api/advisor { message, history, studentId } -> { reply }`

**The Gemini key lives here and nowhere else.** The app used to call Gemini
directly with `EXPO_PUBLIC_GEMINI_API_KEY` — and anything prefixed
`EXPO_PUBLIC_` is compiled into the APK, so that key could be read by anyone
who downloaded the app. Set `GEMINI_API_KEY` in `.env.production`; the app
has no key at all.

Moving it also fixed a second problem: the system prompt is now built on the
server from the student's own released results. The app sends only a question
and the conversation so far. It cannot claim to be a different student, state
marks it does not have, or grant itself a different instruction — the roles in
the history are forced to `user`/`model` so a crafted payload cannot smuggle
in a system turn.

`lib/advisor.ts` holds the prompt, and its rules are tested: the advisor may
compare, explain and encourage, but it may **never** say a student has
qualified or will be admitted. Admission is decided by the institutions and
cut-off points move every year — a confident wrong answer becomes a furious
parent in the head teacher's office, and the end of a contract.

Questions are rate limited per account (in memory, so per instance; move it
to shared storage if the portal is ever run as more than one).

## Keeping Next up to date

The portal runs Next 14.2.x, and 14.2.15 carried advisories rated critical —
a denial of service through Server Actions, an authorization bypass in
middleware, and information exposure from the dev server. It is on a public
hostname holding student marks and parent contact details, so it stays
patched.

`npm audit` will offer to "fix" this by installing Next 16, which is two
major versions and would be a rewrite of the deploy on a live portal. The
answer is the latest 14.2.x, which is a patch-level move with no API change.

What audit still reports afterwards is real but does not describe this app.
Every remaining advisory needs the image optimizer, middleware, rewrites,
i18n on the Pages Router, a custom server, the Edge runtime, or CSP nonces —
and this portal uses none of them. That is worth re-checking rather than
assuming if any of those are ever added:

    grep -rl "next/image\|next/script" app lib
    ls middleware.* ; grep -nE "rewrites|redirects|i18n|images" next.config.js

The one to watch is cache poisoning of React Server Component responses,
which needs a cache in front of the app. Caddy does not cache; Cloudflare
with the orange cloud on would. Turning proxying on is the moment to revisit
whether 14.2.x is still enough.

## Running the browser suites

    npm run smoke          portal: marks entry, verify, release
    npm run smoke:app      the family app itself, against this server
    npm run smoke:families access slips for parents
    npm run smoke:push     announcements and what a notification may say
    npm run smoke:platform the Midway console, and who cannot reach it
    npm run smoke:api      mobile API and the advisor
    npm run smoke:setup    onboarding a school from nothing
    npm run smoke:reports  report cards and print output

`smoke:app` needs the Expo app running as well as the portal, started the
way a build starts it — by naming the school:

```bash
EXPO_OFFLINE=1 SCHOOL=nabisunsa-girls SCHOOL_ALLOW_HTTP=1 \
  SCHOOL_API_OVERRIDE=http://127.0.0.1:4500 npx expo start --web --offline
```

It drives the web build, which is not what ships, but it is the same React
tree the phone runs — so it catches what matters: a parent signs in, sees her
own child's released marks and not the unreleased ones, switches to her
second daughter, opens the report card, and turns a printed slip into an
account. It found two real bugs on its first run, including a parent left
stranded on the activation screen after successfully activating.

The browser needs `--disable-web-security` for it, because the app is served
from :8081 and the API from :4500. That is a browser concern only: a native
app has no origin and no preflight, so the API is not loosened for it.

Each reseeds the demo school first. They share a database and change it as
they go — the portal suite releases Mathematics — so without that they pass
or fail depending on the order they were run in.

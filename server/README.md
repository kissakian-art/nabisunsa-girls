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

## Applying the schema

```bash
docker exec -i mysql mysql -uroot -p -e 'CREATE DATABASE midway_school'
docker exec -i mysql mysql -uroot -p midway_school < server/db/migrations/001_init.sql
docker exec -i mysql mysql -uroot -p midway_school < server/db/migrations/002_subject_catalog.sql
```

`002` loads the national subject catalogue — shared reference data every
school is seeded from, maintained once centrally.

Removing a tenant is an ordered operation, not `DELETE FROM schools`: see
`scripts/lib/teardown.js` for why, and use `deleteSchoolBySlug`.

Use a `_dev` database name until the portal is deployed; nothing the live
apps touch should be involved.

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

## Running the browser suites

    npm run smoke          portal: marks entry, verify, release
    npm run smoke:api      mobile API and the advisor
    npm run smoke:setup    onboarding a school from nothing
    npm run smoke:reports  report cards and print output

Each reseeds the demo school first. They share a database and change it as
they go — the portal suite releases Mathematics — so without that they pass
or fail depending on the order they were run in.

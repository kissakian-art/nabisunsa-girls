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

## Applying the schema

```bash
docker exec -i mysql mysql -uroot -p -e 'CREATE DATABASE midway_school'
docker exec -i mysql mysql -uroot -p midway_school < server/db/migrations/001_init.sql
```

Use a `_dev` database name until the portal is deployed; nothing the live
apps touch should be involved.

# Putting the portal on the VPS

Written to be pasted. Every command here is either run on your own PC (in the
repository) or on the server after `ssh`. Nothing is left as an exercise.

The end state: the Director of Studies office signs in at
`https://school.midwayug.com`, and the branded app talks to the same host.

---

## Before you start

**DNS.** `school.midwayug.com` must point at the VPS, `167.233.217.240`, and
for the first deploy it must be **DNS only** (the grey cloud in Cloudflare,
not the orange one). Caddy gets the HTTPS certificate itself, and it cannot
do that while Cloudflare is answering for the name. Once the site is up you
can turn proxying back on, with SSL mode **Full (strict)**.

**Check it before going further** — this should print the VPS address:

```bash
dig +short school.midwayug.com
```

---

## 1. Deploy

On your PC, in the repository:

```bash
bash ops/deploy-school.sh
```

That is the whole deploy, in one SSH connection, and it is safe to run again
at any time. It uploads the source, creates the database and a
least-privilege `school` user, writes `.env.production`, applies any
migrations that are new, builds and starts the container, adds the Caddy
block, and then asks the running app whether it can actually reach its
database.

Nothing in it needs a password from you. The MySQL root password is read from
`/opt/infra/.env` on the server and never leaves it; the app's own database
password and `SESSION_SECRET` are generated there too, so neither ever exists
on the machine you deployed from.

Two things are worth knowing about what it did:

**The app is deliberately not root.** Its database user may read and write
rows and may not create or drop tables, so a bug or an injection cannot cost
you the schema. Migrations are the only thing that runs as root.

**`SESSION_SECRET` signs every session.** Changing it later signs everyone out
at once, which is how you revoke access in a hurry. `GEMINI_API_KEY` is left
empty, and the academic advisor then tells parents it is not configured yet,
which is a clean thing for it to say.

## 2. If the schema needs adopting

Only for a database built by hand before the migration runner existed: it has
the tables but no ledger, so the deploy stops rather than re-running `001`
over a schema that already has those tables. Tell it how far that database
already goes, once, on the server:

```bash
ADOPT=003_family_invites.sql bash /opt/apps/school/ops/migrate.sh
```

Name the last migration the database really has. Adopting more than that
leaves it permanently missing whatever was skipped, with a ledger saying
otherwise. After that one run, `ops/deploy-school.sh` handles the schema on
its own and this never comes up again.

A fresh database — anything the deploy created itself — never needs this.

## 3. The platform administrator

The one thing that cannot be done through a browser, because it is what
creates the first way in:

```bash
docker exec -it school env ADMIN_PASSWORD='choose-a-long-one' \
  node scripts/bootstrap-platform-admin.js \
    --email you@midwayug.com --name "Your Name"
```

At least 12 characters. The password is passed in the environment rather than
as `--password` so it does not appear in the container's process list.
Re-running is safe: an existing account is never given a new password.

Then sign in at `https://school.midwayug.com/platform` — Midway's own console,
not the school portal — and add schools there. Each school is created with the
Ugandan 20/80 weighting, the standard grading scale and its own administrator,
so onboarding a school never needs a shell on this server again.

### The old way, for a school with no console

`scripts/bootstrap-school.js` still creates a school and its administrator
directly, which is useful if you are standing up a single-school deployment
and do not want a platform account at all:

```bash
docker exec -it school env ADMIN_PASSWORD='choose-a-long-one' \
  node scripts/bootstrap-school.js \
    --slug nabisunsa-girls \
    --name "Nabisunsa Girls' Secondary School" \
    --admin head@nabisunsagirls.ac.ug
```

The slug matters either way: it is what the branded app sends with every
sign-in, so it must match the `slug` in `schools/<slug>/school.json` in the
app repository.

## 4. Check it

```bash
curl -s https://school.midwayug.com/api/health
```

`{"ok":true,...}` means the app is up, the database is reachable and the
schema is there.

Then sign in at `/platform` as the administrator you just created and add the
school. That gives the school its own administrator, who signs in at `/` and
works through **Setup**: classes, subjects, class lists, marksheets. No SQL
from here on, and no further SSH.

The two sign-in pages are separate on purpose. A platform account cannot sign
into the school portal or the family app, and a school account cannot reach
the console — they are different tables, and their session cookies are signed
for different audiences, so neither token is usable in the other's place.

---

## When something is wrong

| What you see | What it means |
|---|---|
| `"database": false` in health | The app cannot reach MySQL. Check the password in `.env.production` and that both containers are on the `web` network: `docker network inspect web \| grep -E 'school\|mysql'` |
| `"schema": false` | The migrations did not run — re-run the deploy and read its `=== schema ===` section |
| `"sessionSecret": false` | `SESSION_SECRET` is missing or still `CHANGE_ME` |
| Caddy will not get a certificate | DNS is proxied (orange cloud) or not pointing at the VPS |
| `docker logs school` shows nothing | The container is not running: `docker compose -f /opt/apps/school/docker-compose.yml up -d` |

## Deploying again later

```bash
bash ops/deploy-school.sh
```

That is all of it, the schema included. There is no second command to
remember, which is the point: a step you have to remember after every deploy
is a step that eventually gets skipped, and a skipped migration is code
running against a schema that does not match it.

The previous release stays on the server as `/opt/apps/school/src.old`, so a
bad deploy can be undone by swapping it back and rebuilding.

## The mobile app points here

The branded build reads `schools/<slug>/school.json` in the app repository:

```json
{ "slug": "nabisunsa-girls", "apiBaseUrl": "https://school.midwayug.com" }
```

The slug must be exactly the one the console shows for that school — the app
sends it with every sign-in. Building an app is `BUILDING.md`.

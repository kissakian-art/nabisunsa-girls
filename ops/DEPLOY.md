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

The first run stops and tells you `.env.production` is missing. That is
expected — it is step 3.

## 2. The database and its user

On the server (`ssh -i ~/.ssh/midway_ed25519 root@167.233.217.240`):

```bash
docker exec -i mysql mysql -uroot -p <<'SQL'
CREATE DATABASE IF NOT EXISTS midway_school
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'school'@'%' IDENTIFIED BY 'PUT_A_STRONG_PASSWORD_HERE';
GRANT SELECT, INSERT, UPDATE, DELETE ON midway_school.* TO 'school'@'%';
FLUSH PRIVILEGES;
SQL
```

Choose a real password and keep it — the next step needs it. The app is
deliberately not root: it may read and write rows, and may not create or drop
tables. A bug or an injection cannot cost you the schema.

## 3. The app's configuration

Still on the server:

```bash
cd /opt/apps/school
cat > .env.production <<ENV
DATABASE_URL="mysql://school:THE_PASSWORD_FROM_STEP_2@mysql:3306/midway_school"
SESSION_SECRET="$(openssl rand -hex 32)"
GEMINI_API_KEY=""
ENV
chmod 600 .env.production
```

`SESSION_SECRET` signs every session. Changing it later signs everyone out at
once, which is how you revoke access in a hurry. `GEMINI_API_KEY` is the
academic advisor; leave it empty and the advisor tells parents it is not
configured yet, which is a clean thing for it to say.

## 4. Deploy again

On your PC:

```bash
bash ops/deploy-school.sh
```

This time it builds and starts. It will say Caddy has no block yet — step 6.

## 5. The schema

On the server:

```bash
bash /opt/apps/school/ops/migrate.sh
```

It asks for the MySQL **root** password (not the school one) and applies only
the migrations that have not been applied before. Run it after every deploy
that changes the database; running it when nothing has changed prints
"Schema already up to date" and does nothing.

## 6. Caddy

On the server. **Append** — never edit the file with an editor that replaces
it, because that swaps the inode and Caddy's container keeps reading the old
one:

```bash
cat >> /opt/infra/caddy/Caddyfile <<'CADDY'

school.midwayug.com {
        encode gzip
        reverse_proxy school:4500
}
CADDY
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## 7. The first school and its administrator

The one thing that cannot be done through the portal, because it is what
creates the first way in:

```bash
docker exec -it school node scripts/bootstrap-school.js \
  --slug nabisunsa-girls \
  --name "Nabisunsa Girls' Secondary School" \
  --admin head@nabisunsagirls.ac.ug \
  --password 'choose-a-long-one'
```

The slug matters: it is what the branded app sends with every sign-in, so it
must match `EXPO_PUBLIC_SCHOOL_SLUG` in that school's build. Re-running this
is safe — it never changes an existing account's password.

## 8. Check it

```bash
curl -s https://school.midwayug.com/api/health
```

`{"ok":true,...}` means the app is up, the database is reachable and the
schema is there. Then open the site and sign in as the administrator you just
created, and work through **Setup**: classes, subjects, class lists,
marksheets. No SQL from here on.

---

## When something is wrong

| What you see | What it means |
|---|---|
| `"database": false` in health | The app cannot reach MySQL. Check the password in `.env.production` and that both containers are on the `web` network: `docker network inspect web \| grep -E 'school\|mysql'` |
| `"schema": false` | Step 5 has not been run |
| `"sessionSecret": false` | `SESSION_SECRET` is missing or still `CHANGE_ME` |
| Caddy will not get a certificate | DNS is proxied (orange cloud) or not pointing at the VPS |
| `docker logs school` shows nothing | The container is not running: `docker compose -f /opt/apps/school/docker-compose.yml up -d` |

## Deploying again later

```bash
bash ops/deploy-school.sh          # on your PC
bash /opt/apps/school/ops/migrate.sh   # on the server, if the schema changed
```

The previous release stays on the server as `/opt/apps/school/src.old`, so a
bad deploy can be undone by swapping it back and rebuilding.

## The mobile app points here

The branded build needs, in its `.env`:

```
EXPO_PUBLIC_API_BASE_URL=https://school.midwayug.com
EXPO_PUBLIC_SCHOOL_SLUG=nabisunsa-girls
```

The slug must be exactly the one from step 7.

#!/usr/bin/env bash
#
# One-connection deploy: School portal  ->  https://school.midwayug.com
#
# ONE CONNECTION, deliberately: per DEPLOYMENT_HANDOFF §8b, sshd on this box
# wedges after a handful of connections, and a deploy that looped scp/ssh
# once cost this PC its access entirely. So everything travels in a single
# tar stream and a single remote shell, exactly like deploy-books.sh.
#
# Usage:  bash ops/deploy-school.sh
#
# Safe to run again at any time. On a second run the database, its user,
# .env.production and the Caddy block are all detected and left alone; only
# the source, the image and any new migrations move.
#
# The one thing this does NOT do is create the first platform administrator.
# That needs a password a person chose, so it stays a deliberate manual step
# — see ops/DEPLOY.md. Everything else the server needs is here, because
# every step left "for the operator to paste afterwards" is another SSH
# connection this box may not give you.
#
set -euo pipefail

KEY="${KEY:-$HOME/.ssh/midway_ed25519}"
HOST="${HOST:-root@167.233.217.240}"
DOMAIN="${DOMAIN:-school.midwayug.com}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -d "$REPO/server" ] || { echo "Source not found: $REPO/server" >&2; exit 1; }
[ -f "$KEY" ]         || { echo "SSH key not found: $KEY" >&2; exit 1; }

read -r -d '' REMOTE <<'REMOTE_EOF' || true
set -euo pipefail
umask 077

DOMAIN="${DOMAIN:-school.midwayug.com}"
APP=/opt/apps/school
mkdir -p "$APP"
cd "$APP"

# --- source ------------------------------------------------------------
# Extract-and-swap. Never untar over an existing src/: tar adds and
# overwrites but never deletes, so a file removed in this revision would
# survive on the server and keep being rebuilt into the image.
echo "=== upload ==="
rm -rf staging && mkdir staging
tar -C staging -xz
[ -d src ] && rm -rf src.old && mv src src.old
mv staging/server src
rm -rf ops && mv staging/ops ops
rm -rf staging
echo "  source swapped in (previous release kept as src.old)"

# The deployed compose file is never overwritten: it may carry local edits
# that only this server knows about. But silently keeping an old one while
# the repository moved on is how a deploy quietly stops matching the code,
# so say when they differ.
if [ ! -f docker-compose.yml ]; then
  mv src/docker-compose.yml . 2>/dev/null || true
elif [ -f src/docker-compose.yml ] && ! cmp -s src/docker-compose.yml docker-compose.yml; then
  echo "  !! docker-compose.yml on this server differs from the repository's."
  echo "     Yours was kept: diff $APP/docker-compose.yml $APP/src.old/docker-compose.yml"
fi
rm -f src/docker-compose.yml

# --- database ----------------------------------------------------------
# The MySQL root password is read from /opt/infra/.env here on the server and
# never leaves it — it is not typed, not passed on a command line, and never
# reaches the machine running the deploy.
#
# The app's own user is least-privilege: it may read and write rows and may
# not create or drop tables, so a bug or an injection cannot cost the schema.
# Migrations are the only thing that runs as root.
ROOT_PW="$(grep -E '^MYSQL_ROOT_PASSWORD=' /opt/infra/.env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\042\047')"
if [ -z "$ROOT_PW" ]; then
  echo "ABORT: MYSQL_ROOT_PASSWORD not found in /opt/infra/.env" >&2
  echo "       This deploy expects the shared Midway infrastructure (see handoff §2)." >&2
  exit 1
fi
export MYSQL_PWD="$ROOT_PW"

asroot() { docker exec -i -e MYSQL_PWD mysql mysql -uroot "$@"; }

echo "=== database ==="
asroot -e "CREATE DATABASE IF NOT EXISTS midway_school
             CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

if [ ! -f .env.production ]; then
  # Both secrets are generated here, on the server, so neither ever exists on
  # the PC that ran the deploy.
  DB_PW="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
  asroot <<SQL
CREATE USER IF NOT EXISTS 'school'@'%' IDENTIFIED BY '${DB_PW}';
ALTER USER 'school'@'%' IDENTIFIED BY '${DB_PW}';
GRANT SELECT, INSERT, UPDATE, DELETE ON midway_school.* TO 'school'@'%';
FLUSH PRIVILEGES;
SQL
  cat > .env.production <<ENV
DATABASE_URL="mysql://school:${DB_PW}@mysql:3306/midway_school"
SESSION_SECRET="$(openssl rand -hex 32)"
GEMINI_API_KEY=""
ENV
  chmod 600 .env.production
  echo "  created the 'school' database user and .env.production"
  echo "  (SESSION_SECRET signs every session — changing it signs everyone out at once)"
else
  echo "  .env.production already present — kept, and the database user with it"
fi

# --- schema ------------------------------------------------------------
# ops/migrate.sh is the one implementation of this, ledger and ADOPT and all.
# Calling it rather than repeating its logic here is deliberate: the two
# copies that existed before drifted, and the one that ran was the one
# nobody had reviewed.
#
# MYSQL_PWD is already exported, so it does not stop to prompt.
echo "=== schema ==="
DB=midway_school DIR="$APP/src/db/migrations" bash "$APP/ops/migrate.sh" 2>&1 | sed 's/^/  /'

# --- build and start ---------------------------------------------------
echo "=== building ==="
docker compose build

echo "=== starting ==="
docker compose up -d

# 40 GB disk, and every rebuild leaves the previous image dangling (handoff §11).
docker image prune -f >/dev/null 2>&1 || true

echo "=== container ==="
docker ps --filter name=school --format "  {{.Names}}	{{.Status}}"

# --- Caddy -------------------------------------------------------------
# Append only. The Caddyfile is bind-mounted, so anything that replaces the
# inode (mv, sed -i) detaches the container's view and it keeps serving the
# old config (handoff §2).
echo "=== caddy ==="
if grep -q "$DOMAIN" /opt/infra/caddy/Caddyfile; then
  echo "  block for $DOMAIN already present"
else
  cat >> /opt/infra/caddy/Caddyfile <<CADDY

$DOMAIN {
        encode gzip
        reverse_proxy school:4500
}
CADDY
  docker exec caddy caddy reload --config /etc/caddy/Caddyfile
  echo "  block added and Caddy reloaded"
fi

# --- does it actually work ---------------------------------------------
# "Running" is not "working": the usual first-deploy failure is a container
# that starts perfectly and cannot reach the database.
#
# Asked from inside the container, which works only because the image sets
# HOSTNAME=0.0.0.0. Next's standalone server binds to that variable and
# Docker sets it to the container id, so without the override the app listens
# on the container's IP alone and this is refused on 127.0.0.1 every time,
# while the site is perfectly healthy from outside.
#
# Polled rather than slept, so a slow start is not reported as a failure.
echo "=== health ==="
healthy=0
for attempt in $(seq 1 20); do
  if out="$(docker exec school node -e '
        fetch("http://127.0.0.1:4500/api/health")
          .then(r => r.json())
          .then(b => { console.log(JSON.stringify(b.checks)); process.exit(b.ok ? 0 : 1); })
          .catch(e => { console.log("unreachable: " + e.message); process.exit(1); });
      ' 2>/dev/null)"; then
    echo "  $out"
    echo "  healthy"
    healthy=1
    break
  fi
  sleep 2
done
if [ "$healthy" = "0" ]; then
  echo "  ${out:-no answer} — still not healthy after 40s"
  echo "  (docker logs --tail 50 school)"
fi

# --- the one manual step -----------------------------------------------
# Only reported when it is actually outstanding, so a routine deploy does not
# print instructions nobody needs.
if ! asroot --batch --skip-column-names midway_school \
     -e "SELECT COUNT(*) FROM platform_users WHERE is_active = 1;" 2>/dev/null | grep -qv '^0$'; then
  cat <<'FIRSTRUN'

!! Nobody can sign in yet: there is no platform administrator. Create one
   here, choosing the password (at least 12 characters):

     docker exec -it school env ADMIN_PASSWORD='choose-a-long-one' \
       node scripts/bootstrap-platform-admin.js \
         --email you@midwayug.com --name "Your Name"

   Then sign in at /platform and add schools there. It is the only account
   this deployment cannot create through a browser.
FIRSTRUN
fi
REMOTE_EOF

echo "Deploying $REPO  ->  https://$DOMAIN  (single SSH connection)"
echo

# node_modules and .next are rebuilt in the image and are huge; .env.local
# holds development secrets and must never ship.
#
# Both directories travel: server/ becomes the app, ops/ carries the
# migration runner, which has to be on the server to be run there.
tar -C "$REPO" -cz \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.env.local \
  --exclude=tsconfig.tsbuildinfo \
  server ops \
  | ssh -T -i "$KEY" -o BatchMode=yes -o ConnectTimeout=40 "$HOST" \
      "DOMAIN=$(printf %q "$DOMAIN")
$REMOTE"

echo
echo "=== from here, no SSH needed ==="
curl -s -o /dev/null -w "  https://$DOMAIN/login  ->  %{http_code}\n" --max-time 30 "https://$DOMAIN/login" || true
curl -s --max-time 30 "https://$DOMAIN/api/health" | head -c 400; echo

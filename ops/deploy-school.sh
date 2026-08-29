#!/usr/bin/env bash
#
# One-connection deploy: School portal  ->  https://school.midwayug.com
#
# ONE CONNECTION, deliberately: per DEPLOYMENT_HANDOFF §8b, a deploy that
# looped scp/ssh got this PC's source IP filtered off port 22 of the VPS, and
# only switching network restored access. So everything travels in a single
# tar stream and a single remote shell, exactly like deploy-books.sh.
#
# Usage:  bash ops/deploy-school.sh
#
# It is safe to run again at any time. The first run needs three things done
# once on the server, and tells you exactly what they are if they are missing:
# an .env.production, the database, and the Caddy block.
#
set -euo pipefail

KEY="${KEY:-$HOME/.ssh/midway_ed25519}"
HOST="${HOST:-root@167.233.217.240}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[ -d "$REPO/server" ] || { echo "Source not found: $REPO/server" >&2; exit 1; }

echo "Uploading source + building (single SSH connection)..."

# Both directories travel: server/ becomes the app, ops/ carries the
# migration runner, which has to be on the server to be run there.
#
# Excludes matter: node_modules and .next are rebuilt in the image and are
# huge; .env.local holds development secrets and must never ship.
tar -C "$REPO" -cz \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.env.local \
  --exclude=tsconfig.tsbuildinfo \
  server ops | ssh -T -i "$KEY" -o BatchMode=yes -o ConnectTimeout=40 "$HOST" '
set -euo pipefail

mkdir -p /opt/apps/school
cd /opt/apps/school

# Extract-and-swap. Never untar over an existing src/: tar does not delete,
# so files removed in this revision would survive and be rebuilt.
rm -rf staging && mkdir staging
tar -C staging -xz
[ -d src ] && rm -rf src.old && mv src src.old
mv staging/server src
rm -rf ops && mv staging/ops ops
rm -rf staging

# The deployed compose file is never overwritten: it may carry local edits
# that only this server knows about. But silently keeping an old one while
# the repository moved on is how a deploy quietly stops matching the code,
# so say when they differ.
if [ ! -f docker-compose.yml ]; then
  mv src/docker-compose.yml . 2>/dev/null || true
elif [ -f src/docker-compose.yml ] && ! cmp -s src/docker-compose.yml docker-compose.yml; then
  echo
  echo "!! docker-compose.yml on this server differs from the one in the repository."
  echo "   Yours was kept. Compare them if something behaves unexpectedly:"
  echo "     diff /opt/apps/school/docker-compose.yml /opt/apps/school/src.old/docker-compose.yml"
fi
rm -f src/docker-compose.yml

if [ ! -f .env.production ]; then
  cat <<"MISSING"

!! /opt/apps/school/.env.production does not exist. Create it, then re-run:

     cd /opt/apps/school
     cat > .env.production <<ENV
DATABASE_URL="mysql://school:THE_SCHOOL_DB_PASSWORD@mysql:3306/midway_school"
SESSION_SECRET="$(openssl rand -hex 32)"
GEMINI_API_KEY=""
ENV
     chmod 600 .env.production

   SESSION_SECRET is generated above — it signs every session, and changing
   it later signs everyone out, which is how you revoke access in a hurry.
MISSING
  exit 1
fi

echo "=== schema ==="
if [ -f ops/migrate.sh ]; then
  echo "  run this yourself if the schema has changed:"
  echo "    bash /opt/apps/school/ops/migrate.sh"
  echo "  (it asks for the MySQL root password and applies only what is new)"
fi

echo "=== building ==="
docker compose build

echo "=== starting ==="
docker compose up -d

echo "=== container ==="
docker ps --filter name=school --format "  {{.Names}}\t{{.Status}}"

# "Running" is not "working". The usual first-deploy failure is a container
# that starts perfectly and cannot reach the database, so ask it.
echo "=== health ==="
sleep 4
docker exec school node -e "
  fetch(\"http://127.0.0.1:4500/api/health\")
    .then(r => r.json())
    .then(b => {
      console.log(\"  \" + JSON.stringify(b.checks));
      if (!b.ok) { console.log(\"  NOT HEALTHY — see the checks above\"); process.exit(1); }
      console.log(\"  healthy\");
    })
    .catch(e => { console.log(\"  could not reach the app: \" + e.message); process.exit(1); });
" || echo "  (health check failed — docker logs school)"

if ! grep -q "school.midwayug.com" /opt/infra/caddy/Caddyfile; then
  echo
  echo "!! Caddy has no block for school.midwayug.com yet. Add it IN PLACE"
  echo "   (>> append — never mv/sed -i, which replaces the inode and detaches"
  echo "   the container'"'"'s view of the file), then reload:"
  echo
  echo "     cat >> /opt/infra/caddy/Caddyfile <<CADDY"
  echo "school.midwayug.com {"
  echo "        encode gzip"
  echo "        reverse_proxy school:4500"
  echo "}"
  echo "CADDY"
  echo "     docker exec caddy caddy reload --config /etc/caddy/Caddyfile"
fi
'

cat <<'NEXT'

Deployed.

FIRST TIME ONLY, on the server (ssh in and paste):

  # 1. The database and a least-privilege user. The app must never be root.
  docker exec -i mysql mysql -uroot -p <<'SQL'
  CREATE DATABASE IF NOT EXISTS midway_school
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'school'@'%' IDENTIFIED BY 'PUT_A_STRONG_PASSWORD_HERE';
  GRANT SELECT, INSERT, UPDATE, DELETE ON midway_school.* TO 'school'@'%';
  FLUSH PRIVILEGES;
  SQL

  # 2. The schema. Applies only what has not been applied before.
  bash /opt/apps/school/ops/migrate.sh

  # 3. The first school and its administrator — the one thing that cannot be
  #    done through the portal, because it creates the first way in.
  docker exec -it school node scripts/bootstrap-school.js \
    --slug nabisunsa-girls \
    --name "Nabisunsa Girls' Secondary School" \
    --admin head@nabisunsagirls.ac.ug \
    --password 'CHOOSE_A_LONG_ONE'

Then sign in at https://school.midwayug.com and work through Setup.

Afterwards, to check on it:
  docker logs --tail 50 school
  curl -s https://school.midwayug.com/api/health
NEXT

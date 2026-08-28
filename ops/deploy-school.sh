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
# First run also needs, once, on the server:
#   - a `school` MySQL user and the midway_school database (see below)
#   - the Caddy block for school.midwayug.com
# Both are printed at the end if they are missing.
#
set -euo pipefail

KEY="${KEY:-$HOME/.ssh/midway_ed25519}"
HOST="${HOST:-root@167.233.217.240}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../server" && pwd)"

[ -d "$SRC" ] || { echo "Source not found: $SRC" >&2; exit 1; }

echo "Uploading source + building (single SSH connection)..."

# Excludes matter: node_modules and .next are rebuilt in the image and are
# huge; .env.local holds development secrets and must never ship.
tar -C "$SRC" -cz \
  --exclude=node_modules \
  --exclude=.next \
  --exclude=.env.local \
  --exclude=tsconfig.tsbuildinfo \
  . | ssh -T -i "$KEY" -o BatchMode=yes -o ConnectTimeout=40 "$HOST" '
set -euo pipefail

mkdir -p /opt/apps/school
cd /opt/apps/school

# Extract-and-swap. Never untar over an existing src/: tar does not delete,
# so files removed in this revision would survive and be rebuilt.
rm -rf src.new && mkdir src.new
tar -C src.new -xz
[ -d src ] && rm -rf src.old && mv src src.old
mv src.new src

if [ ! -f docker-compose.yml ]; then
  mv src/docker-compose.yml . 2>/dev/null || true
fi
rm -f src/docker-compose.yml

if [ ! -f .env.production ]; then
  echo
  echo "!! /opt/apps/school/.env.production does not exist."
  echo "   Create it (chmod 600) with DATABASE_URL and SESSION_SECRET, then re-run."
  echo "   Generate a secret with: openssl rand -hex 32"
  exit 1
fi

echo "=== building ==="
docker compose build

echo "=== starting ==="
docker compose up -d

echo "=== container ==="
docker ps --filter name=school --format "  {{.Names}}\t{{.Status}}"

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

First time only, on the server:

  # database + least-privilege user (do NOT let the app use root)
  docker exec -i mysql mysql -uroot -p <<'SQL'
  CREATE DATABASE IF NOT EXISTS midway_school
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER IF NOT EXISTS 'school'@'%' IDENTIFIED BY 'PUT_A_STRONG_PASSWORD_HERE';
  GRANT SELECT, INSERT, UPDATE, DELETE ON midway_school.* TO 'school'@'%';
  FLUSH PRIVILEGES;
  SQL

  # schema
  docker exec -i mysql mysql -uroot -p midway_school < /opt/apps/school/src/db/migrations/001_init.sql

Check it afterwards:
  docker logs --tail 50 school
  curl -sI https://school.midwayug.com | head -1
NEXT

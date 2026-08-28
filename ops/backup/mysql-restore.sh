#!/usr/bin/env bash
#
# Restore one database from a backup set — runs ON the VPS, by hand.
#
# A backup nobody has restored is not a backup, it is a hope. Run this at
# least once against a scratch database name before you need it in anger:
#
#   bash /opt/backups/bin/mysql-restore.sh --list
#   bash /opt/backups/bin/mysql-restore.sh --from 2026-08-29_0200 --db yourhires --into restore_test
#
# Restoring OVER a live database is deliberately awkward: it requires
# --into to name the live database explicitly and then typing the database
# name at a prompt. Before it overwrites anything it takes a safety dump of
# the current contents, so a wrong restore is still recoverable.
#
set -euo pipefail

CONFIG="/etc/midway-backup.env"
# shellcheck source=/dev/null
[ -r "$CONFIG" ] && . "$CONFIG"

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
INFRA_ENV="${INFRA_ENV:-/opt/infra/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/mysql}"

log() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Usage:
  mysql-restore.sh --list
  mysql-restore.sh --from <SET> --db <DATABASE> --into <TARGET_DATABASE>

  --list          show available backup sets and the databases in each
  --from  SET     directory name of the set, e.g. 2026-08-29_0200
  --db    NAME    which database's dump to read from that set
  --into  NAME    database to load it into. Use a scratch name to rehearse;
                  naming a live database triggers a typed confirmation.
USAGE
}

FROM=""; DB=""; INTO=""; LIST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list) LIST=1; shift ;;
    --from) FROM="${2:-}"; shift 2 ;;
    --db)   DB="${2:-}";   shift 2 ;;
    --into) INTO="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [ "$LIST" = "1" ]; then
  for tier in daily weekly; do
    [ -d "$BACKUP_ROOT/$tier" ] || continue
    echo "== $tier =="
    find "$BACKUP_ROOT/$tier" -mindepth 1 -maxdepth 1 -type d | sort | while read -r set_dir; do
      printf '  %s  (%s)\n' "$(basename "$set_dir")" "$(du -sh "$set_dir" | cut -f1)"
      find "$set_dir" -name '*.sql.gz' -printf '      %f\n' | sort
    done
  done
  exit 0
fi

[ -n "$FROM" ] && [ -n "$DB" ] && [ -n "$INTO" ] || { usage; exit 1; }

SRC=""
for tier in daily weekly; do
  [ -f "$BACKUP_ROOT/$tier/$FROM/$DB.sql.gz" ] && SRC="$BACKUP_ROOT/$tier/$FROM/$DB.sql.gz" && break
done
[ -n "$SRC" ] || die "no dump for '$DB' in set '$FROM' (try --list)"

gzip -t "$SRC" 2>/dev/null || die "$SRC fails its integrity check — do not restore from it"
zcat "$SRC" | tail -5 | grep -q '^-- Dump completed' \
  || die "$SRC is an incomplete dump — do not restore from it"

[ -r "$INFRA_ENV" ] || die "cannot read $INFRA_ENV"
ROOT_PW="$(grep -E '^[[:space:]]*(MYSQL_ROOT_PASSWORD|MARIADB_ROOT_PASSWORD|DB_ROOT_PASSWORD)=' "$INFRA_ENV" \
  | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')" || true
[ -n "${ROOT_PW:-}" ] || die "no MYSQL_ROOT_PASSWORD found in $INFRA_ENV"

mysql_root() { docker exec -i -e MYSQL_PWD="$ROOT_PW" "$MYSQL_CONTAINER" mysql -uroot "$@"; }

TARGET_EXISTS="$(mysql_root -N -B -e \
  "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$INTO';" </dev/null)"

if [ "$TARGET_EXISTS" != "0" ]; then
  TABLES="$(mysql_root -N -B -e \
    "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$INTO';" </dev/null)"
  echo
  echo "  Database '$INTO' already exists and holds $TABLES table(s)."
  echo "  Restoring will REPLACE its contents with the dump taken at $FROM."
  echo
  printf "  Type the database name to confirm: "
  read -r CONFIRM
  [ "$CONFIRM" = "$INTO" ] || die "confirmation did not match — nothing changed"

  SAFETY="$BACKUP_ROOT/pre-restore/$(date '+%Y-%m-%d_%H%M')_${INTO}.sql.gz"
  mkdir -p "$(dirname "$SAFETY")"
  log "taking a safety dump of the current '$INTO' -> $SAFETY"
  docker exec -e MYSQL_PWD="$ROOT_PW" "$MYSQL_CONTAINER" \
    mysqldump -uroot --single-transaction --quick --routines --triggers --events \
      --no-tablespaces --default-character-set=utf8mb4 "$INTO" | gzip -6 > "$SAFETY"
  gzip -t "$SAFETY" || die "safety dump failed its integrity check — aborting before any change"
  log "safety dump ok"
fi

log "creating '$INTO' if absent"
mysql_root -e "CREATE DATABASE IF NOT EXISTS \`$INTO\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" </dev/null

log "restoring $DB -> $INTO"
zcat "$SRC" | docker exec -i -e MYSQL_PWD="$ROOT_PW" "$MYSQL_CONTAINER" mysql -uroot "$INTO"

COUNT="$(mysql_root -N -B -e \
  "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$INTO';" </dev/null)"
log "done — '$INTO' now holds $COUNT table(s)"
echo
echo "  Restart the app that uses this database if it caches connections or schema."

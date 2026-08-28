#!/usr/bin/env bash
#
# Nightly MySQL backup — runs ON the VPS, invoked by midway-backup.timer.
#
# Closes the gap recorded as the top TODO in DEPLOYMENT_HANDOFF §8: five
# production databases on one 40 GB disk with no dump, no snapshot and no
# offsite copy.
#
# WHY PER-DATABASE DUMPS, not --all-databases:
#   The failure this protects against is almost never "the whole server died"
#   (Hetzner Backups cover that — enable them too). It is "someone dropped a
#   table in one app". Restoring one database from a combined dump means
#   hand-editing a multi-hundred-MB SQL file under pressure. Per-database
#   files make that a single command. See mysql-restore.sh.
#
# WHY --single-transaction:
#   All five apps stay live during the dump. On InnoDB this takes a consistent
#   snapshot without locking writers. Without it the dump either blocks the
#   apps or produces a torn backup.
#
# The dump is verified after writing: gzip integrity AND the presence of
# mysqldump's own completion marker. A dump that failed halfway still
# compresses cleanly, so the marker is the check that actually matters.
#
set -euo pipefail

CONFIG="/etc/midway-backup.env"
# shellcheck source=/dev/null
[ -r "$CONFIG" ] && . "$CONFIG"

MYSQL_CONTAINER="${MYSQL_CONTAINER:-mysql}"
INFRA_ENV="${INFRA_ENV:-/opt/infra/.env}"
BACKUP_ROOT="${BACKUP_ROOT:-/opt/backups/mysql}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"
MIN_FREE_MB="${MIN_FREE_MB:-4096}"
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-100}"   # sanity floor only; the completion marker is the real check
RCLONE_REMOTE="${RCLONE_REMOTE:-}"      # e.g. "hetzner:midway-backups" — empty disables offsite
HEARTBEAT_URL="${HEARTBEAT_URL:-}"      # pinged only on full success

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

STAMP="$(date '+%Y-%m-%d_%H%M')"
DOW="$(date '+%u')"                      # 7 = Sunday
if [ "$DOW" = "7" ]; then TIER="weekly"; else TIER="daily"; fi
DEST="$BACKUP_ROOT/$TIER/$STAMP"

# --- preconditions -----------------------------------------------------
command -v docker >/dev/null || die "docker not found"
docker inspect -f '{{.State.Running}}' "$MYSQL_CONTAINER" 2>/dev/null | grep -q true \
  || die "container '$MYSQL_CONTAINER' is not running"

[ -r "$INFRA_ENV" ] || die "cannot read $INFRA_ENV (holds the MySQL root password)"

# Pull the root password out of the infra env file rather than hardcoding it.
# The mysql image's own variable name is MYSQL_ROOT_PASSWORD; accept a couple
# of common aliases, but never guess silently.
ROOT_PW="$(grep -E '^[[:space:]]*(MYSQL_ROOT_PASSWORD|MARIADB_ROOT_PASSWORD|DB_ROOT_PASSWORD)=' "$INFRA_ENV" \
  | head -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//')" || true
[ -n "${ROOT_PW:-}" ] || die "no MYSQL_ROOT_PASSWORD found in $INFRA_ENV"

FREE_MB="$(df -Pm "$BACKUP_ROOT" 2>/dev/null | awk 'NR==2{print $4}' || df -Pm / | awk 'NR==2{print $4}')"
[ "${FREE_MB:-0}" -ge "$MIN_FREE_MB" ] \
  || die "only ${FREE_MB}MB free, need ${MIN_FREE_MB}MB — prune before backing up (this disk is 40GB)"

mkdir -p "$DEST"

# --- enumerate databases ----------------------------------------------
# Skip the server's own internal schemas: they are not application data and
# restoring them over a running server does harm rather than good.
mapfile -t DATABASES < <(
  docker exec -e MYSQL_PWD="$ROOT_PW" "$MYSQL_CONTAINER" \
    mysql -uroot -N -B -e 'SHOW DATABASES;' 2>/dev/null \
  | grep -Ev '^(information_schema|performance_schema|mysql|sys)$'
)
[ "${#DATABASES[@]}" -gt 0 ] || die "no application databases found"
log "backing up ${#DATABASES[@]} databases -> $DEST"

# --- dump ---------------------------------------------------------------
FAILED=0
for DB in "${DATABASES[@]}"; do
  OUT="$DEST/${DB}.sql.gz"
  log "  dumping $DB"
  if ! docker exec -e MYSQL_PWD="$ROOT_PW" "$MYSQL_CONTAINER" \
        mysqldump -uroot \
          --single-transaction \
          --quick \
          --routines --triggers --events \
          --no-tablespaces \
          --default-character-set=utf8mb4 \
          "$DB" 2>"$DEST/${DB}.err" | gzip -6 > "$OUT"
  then
    log "  FAILED: $DB — $(tail -1 "$DEST/${DB}.err" 2>/dev/null)"
    FAILED=$((FAILED + 1))
    continue
  fi

  # Verification. The completion marker is the check that matters: gzip -t
  # catches truncation, but a dump that errored mid-stream still compresses
  # cleanly. Size is only a floor against an empty file — a legitimate dump of
  # a small database is well under 1KB gzipped, so do not raise this.
  SIZE="$(stat -c%s "$OUT")"
  if [ "$SIZE" -lt "$MIN_DUMP_BYTES" ]; then
    log "  FAILED: $DB — dump only ${SIZE} bytes"; FAILED=$((FAILED + 1)); continue
  fi
  if ! gzip -t "$OUT" 2>/dev/null; then
    log "  FAILED: $DB — gzip integrity check failed"; FAILED=$((FAILED + 1)); continue
  fi
  if ! zcat "$OUT" | tail -5 | grep -q '^-- Dump completed'; then
    log "  FAILED: $DB — dump is incomplete (no completion marker)"; FAILED=$((FAILED + 1)); continue
  fi
  rm -f "$DEST/${DB}.err"
  log "  ok $DB ($(numfmt --to=iec "$SIZE" 2>/dev/null || echo "${SIZE}B"))"
done

[ "$FAILED" -eq 0 ] || die "$FAILED of ${#DATABASES[@]} dumps failed — backup set at $DEST is INCOMPLETE"

# Manifest: what was captured, and by what server version.
docker exec -e MYSQL_PWD="$ROOT_PW" "$MYSQL_CONTAINER" mysql -uroot -N -B -e 'SELECT VERSION();' \
  > "$DEST/MANIFEST.txt" 2>/dev/null || true
{
  echo "taken_at=$(date -Is)"
  echo "host=$(hostname)"
  echo "databases=${DATABASES[*]}"
} >> "$DEST/MANIFEST.txt"

log "backup set complete: $DEST ($(du -sh "$DEST" | cut -f1))"

# --- rotation -----------------------------------------------------------
prune() {
  local tier="$1"
  local keep="$2"
  local dir="$BACKUP_ROOT/$tier"
  [ -d "$dir" ] || return 0
  local n
  n="$(find "$dir" -mindepth 1 -maxdepth 1 -type d | wc -l)"
  if [ "$n" -gt "$keep" ]; then
    find "$dir" -mindepth 1 -maxdepth 1 -type d | sort | head -n "$((n - keep))" \
      | while read -r old; do log "pruning $old"; rm -rf "$old"; done
  fi
}
prune daily  "$KEEP_DAILY"
prune weekly "$KEEP_WEEKLY"

# --- offsite ------------------------------------------------------------
# Dumps on the same 40GB disk protect against "someone dropped a table".
# They do NOT protect against losing the server. That needs a copy elsewhere.
if [ -n "$RCLONE_REMOTE" ]; then
  if command -v rclone >/dev/null; then
    log "syncing to $RCLONE_REMOTE"
    if rclone sync "$BACKUP_ROOT" "$RCLONE_REMOTE" --transfers 2 --checkers 4 --stats-one-line; then
      log "offsite sync ok"
    else
      die "offsite sync to $RCLONE_REMOTE FAILED — local copy exists but is not safe from disk loss"
    fi
  else
    die "RCLONE_REMOTE is set but rclone is not installed"
  fi
else
  log "WARNING: no RCLONE_REMOTE configured — backups exist only on this server's disk"
fi

[ -n "$HEARTBEAT_URL" ] && curl -fsS -m 20 "$HEARTBEAT_URL" >/dev/null 2>&1 || true
log "done"

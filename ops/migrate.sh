#!/usr/bin/env bash
#
# Applies the database migrations that have not been applied yet.
#
# Runs ON THE SERVER, against the mysql container, using nothing but bash,
# docker and the mysql client already inside it — no toolchain, no node.
#
# Why a ledger rather than "run the SQL files":
#   001_init.sql creates tables. Running it twice fails. Without a record of
#   what has already been applied, every deploy either fails loudly or gets
#   skipped by hand, and "skipped by hand" is how a schema drifts away from
#   the code that expects it.
#
# Usage, on the VPS:
#   bash /opt/apps/school/src/../ops/migrate.sh            # uses defaults
#   DB=midway_school DIR=/opt/apps/school/src/db/migrations bash ops/migrate.sh
#
# The root password is prompted for once, not passed on the command line
# where it would sit in the shell history. A caller that already holds it
# exports MYSQL_PWD and is not asked — which is what lets ops/deploy-school.sh
# run this inside its single SSH connection, where a prompt could not work.

set -euo pipefail

DB="${DB:-midway_school}"
DIR="${DIR:-/opt/apps/school/src/db/migrations}"
CONTAINER="${CONTAINER:-mysql}"

[ -d "$DIR" ] || { echo "No migrations directory at $DIR" >&2; exit 1; }

# Only ask if the caller has not already supplied it. Asking unconditionally
# would hang forever down a non-interactive pipe, which is exactly how the
# deploy runs this.
if [ -z "${MYSQL_PWD:-}" ]; then
  read -rsp "MySQL root password: " MYSQL_PWD
  echo
fi
export MYSQL_PWD

run_sql() {
  docker exec -i -e MYSQL_PWD "$CONTAINER" mysql -uroot --batch --skip-column-names "$@"
}

# The ledger itself, and the database, must exist before anything else.
run_sql -e "CREATE DATABASE IF NOT EXISTS \`$DB\`
              CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
run_sql "$DB" -e "CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   VARCHAR(255) NOT NULL,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (filename)
) ENGINE=InnoDB;"

applied="$(run_sql "$DB" -e 'SELECT filename FROM schema_migrations;')"

# A database built before this runner existed — by hand, from the same files
# — has every table and an empty ledger, and would fail on "table already
# exists" halfway through 001. Adopting records files as applied without
# running them.
#
# ADOPT names the LAST migration that database already has, not "all of
# them": a database built by hand from 001..003 that adopts 004 as well ends
# up permanently missing a column, with a ledger claiming otherwise. Files
# after the named one are applied normally.
#
#   ADOPT=003_family_invites.sql bash ops/migrate.sh
#   ADOPT=1                      bash ops/migrate.sh   # every file present
if [ -z "$applied" ]; then
  has_tables="$(run_sql "$DB" -e "SELECT COUNT(*) FROM information_schema.tables
                                   WHERE table_schema = '$DB' AND table_name = 'schools';")"
  if [ "$has_tables" != "0" ] && [ -z "${ADOPT:-}" ]; then
    cat >&2 <<'ADOPTMSG'

!! This database already has tables but no record of any migration.

   Name the last migration it already has, and the rest are applied normally:

     ADOPT=003_family_invites.sql bash ops/migrate.sh

   Use ADOPT=1 only if it already has every file in db/migrations. Adopting
   more than the database really has leaves it permanently missing whatever
   was skipped, with a ledger saying otherwise.

   If the schema came from somewhere else entirely, do not adopt: compare it
   first.

ADOPTMSG
    exit 1
  fi
fi

# Set while walking the files that the database is declared to already have.
adopting=""
[ -n "${ADOPT:-}" ] && adopting="yes"

pending=0
for path in "$DIR"/*.sql; do
  file="$(basename "$path")"
  if printf '%s\n' "$applied" | grep -qxF "$file"; then
    echo "  already applied  $file"
    continue
  fi

  if [ -n "${adopting:-}" ]; then
    echo "  adopting         $file"
    # The named file is the last one already present; everything after it is
    # applied for real. An `if`, not `[ ] && x`: under `set -e` a false test
    # at the end of a line ends the script.
    if [ "$file" = "${ADOPT:-}" ]; then
      adopting=""
    fi
  else
    echo "  applying         $file"
    # If a migration fails the ledger is not written, so the next run retries
    # it rather than silently moving past a half-applied schema.
    docker exec -i -e MYSQL_PWD "$CONTAINER" mysql -uroot "$DB" < "$path"
  fi
  run_sql "$DB" -e "INSERT INTO schema_migrations (filename) VALUES ('$file');"
  pending=$((pending + 1))
done

echo
if [ "$pending" -eq 0 ]; then
  echo "Schema already up to date."
elif [ -n "${ADOPT:-}" ]; then
  echo "Recorded $pending migration(s). Run again without ADOPT from now on."
else
  echo "Applied $pending migration(s)."
fi

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
# where it would sit in the shell history.

set -euo pipefail

DB="${DB:-midway_school}"
DIR="${DIR:-/opt/apps/school/src/db/migrations}"
CONTAINER="${CONTAINER:-mysql}"

[ -d "$DIR" ] || { echo "No migrations directory at $DIR" >&2; exit 1; }

read -rsp "MySQL root password: " MYSQL_PWD
echo
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

pending=0
for path in "$DIR"/*.sql; do
  file="$(basename "$path")"
  if printf '%s\n' "$applied" | grep -qxF "$file"; then
    echo "  already applied  $file"
    continue
  fi

  echo "  applying         $file"
  # If a migration fails the ledger is not written, so the next run retries
  # it rather than silently moving past a half-applied schema.
  docker exec -i -e MYSQL_PWD "$CONTAINER" mysql -uroot "$DB" < "$path"
  run_sql "$DB" -e "INSERT INTO schema_migrations (filename) VALUES ('$file');"
  pending=$((pending + 1))
done

echo
if [ "$pending" -eq 0 ]; then
  echo "Schema already up to date."
else
  echo "Applied $pending migration(s)."
fi

#!/usr/bin/env bash
#
# Install the nightly MySQL backup job on the VPS  —  ONE ssh connection.
#
#   bash ops/backup/install-backups.sh
#
# ONE CONNECTION, deliberately: per DEPLOYMENT_HANDOFF §8b, a deploy that
# looped scp/ssh got this PC's IP filtered off port 22 and only a different
# network restored access. So everything below travels in a single tar
# stream and a single remote shell, exactly like deploy-books.sh.
#
# Installs:
#   /opt/backups/bin/mysql-backup.sh    the nightly job
#   /opt/backups/bin/mysql-restore.sh   manual restore
#   /etc/midway-backup.env              config (offsite target, retention)
#   midway-backup.service / .timer      systemd, 02:15 daily with jitter
#
# Idempotent: safe to re-run to pick up script changes.
#
set -euo pipefail

KEY="${KEY:-$HOME/.ssh/midway_ed25519}"
HOST="${HOST:-root@167.233.217.240}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$SRC/mysql-backup.sh" ]  || { echo "missing mysql-backup.sh"  >&2; exit 1; }
[ -f "$SRC/mysql-restore.sh" ] || { echo "missing mysql-restore.sh" >&2; exit 1; }

echo "Installing backup job on $HOST (single SSH connection)..."

tar -C "$SRC" -cz mysql-backup.sh mysql-restore.sh | ssh -T -i "$KEY" \
  -o BatchMode=yes -o ConnectTimeout=40 "$HOST" '
set -euo pipefail

mkdir -p /opt/backups/bin /opt/backups/mysql/daily /opt/backups/mysql/weekly
tar -C /opt/backups/bin -xz
chmod 700 /opt/backups/bin/mysql-backup.sh /opt/backups/bin/mysql-restore.sh

# Config file — created once, never overwritten, so local edits survive re-runs.
if [ ! -f /etc/midway-backup.env ]; then
  cat > /etc/midway-backup.env <<"CFG"
# Nightly MySQL backup configuration.
#
# OFFSITE IS THE POINT. Dumps on this same 40GB disk survive "someone dropped
# a table" but not "the server is gone". Set RCLONE_REMOTE to a configured
# rclone target (Hetzner Storage Box over SFTP, or Hetzner Object Storage over
# S3 — both are in the same console as this server).
#
#   apt install rclone && rclone config      # then put the remote name here
#
RCLONE_REMOTE=

# Optional: a URL pinged only on complete success. With no SMTP on this box,
# this is the practical way to find out when backups stop happening —
# a free healthchecks.io check will email you when a ping fails to arrive.
HEARTBEAT_URL=

KEEP_DAILY=7
KEEP_WEEKLY=4
MIN_FREE_MB=4096
CFG
  chmod 600 /etc/midway-backup.env
  echo "  wrote /etc/midway-backup.env (RCLONE_REMOTE is EMPTY — set it)"
else
  echo "  /etc/midway-backup.env exists, left untouched"
fi

cat > /etc/systemd/system/midway-backup.service <<"UNIT"
[Unit]
Description=Nightly MySQL backup (all Midway application databases)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/opt/backups/bin/mysql-backup.sh
# The dump competes with five live apps on 2 vCPU; keep it out of their way.
Nice=10
IOSchedulingClass=idle
UNIT

cat > /etc/systemd/system/midway-backup.timer <<"UNIT"
[Unit]
Description=Run the MySQL backup nightly

[Timer]
OnCalendar=*-*-* 02:15:00
# Survives reboots and downtime: if the box was off at 02:15, run on next boot.
Persistent=true
RandomizedDelaySec=600

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now midway-backup.timer

echo
echo "=== timer ==="
systemctl list-timers midway-backup.timer --no-pager | head -3
echo
echo "=== disk ==="
df -h / | tail -1
'

cat <<'NEXT'

Installed. Three things left, and the first two are not optional:

  1. Set an offsite target. Edit /etc/midway-backup.env and set RCLONE_REMOTE.
     Until then the dumps live only on the same disk as the databases,
     which does not survive losing the server.

  2. Enable Hetzner Backups in the console (Overview -> Options -> BACKUPS).
     Dumps and image backups cover different failures: dumps for "a table was
     dropped", images for "the box died". You want both.

  3. Prove a restore works, BEFORE you need it:

       ssh -i ~/.ssh/midway_ed25519 root@167.233.217.240
       /opt/backups/bin/mysql-backup.sh                 # run one now, watch it
       /opt/backups/bin/mysql-restore.sh --list
       /opt/backups/bin/mysql-restore.sh --from <SET> --db yourhires --into restore_test
       # then drop restore_test

  Check on it later with:
       systemctl status midway-backup.service
       journalctl -u midway-backup.service --since yesterday
NEXT

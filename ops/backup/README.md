# VPS database backups

Closes the top TODO in `DEPLOYMENT_HANDOFF §8`: five production databases on
one 40 GB disk with no dump, no snapshot and no offsite copy.

This matters more now than it did. The school proposal commits in writing to
protecting school data, backing it up, and exporting it on demand. Until this
runs, that commitment is not true — and a school that loses a term of marks
does not renew, it tells other schools.

## Install

From your PC, in the repo root:

```bash
bash ops/backup/install-backups.sh
```

One SSH connection, per the §8b rule about looping `ssh`/`scp` getting your IP
filtered off port 22. Idempotent — re-run it to push script changes.

It installs:

| Path | What |
|---|---|
| `/opt/backups/bin/mysql-backup.sh` | nightly job |
| `/opt/backups/bin/mysql-restore.sh` | manual restore |
| `/etc/midway-backup.env` | config — created once, never overwritten |
| `midway-backup.timer` | systemd, 02:15 daily, `Persistent=true` |

Every application database is discovered automatically at run time, so the
school platform's database is included the day it is created. No edit needed.

## Then do these three things

**1. Set an offsite target.** Edit `/etc/midway-backup.env`, set
`RCLONE_REMOTE`. Without it the dumps sit on the same disk as the databases
and do not survive losing the server.

```bash
apt install rclone && rclone config     # Hetzner Storage Box (SFTP) or Object Storage (S3)
```

**2. Enable Hetzner Backups** in the console (Overview → Options → BACKUPS).
Dumps and image backups cover different failures — dumps for "a table was
dropped", images for "the box died". You want both.

**3. Prove a restore works before you need it.**

```bash
/opt/backups/bin/mysql-backup.sh                 # run one now and watch it
/opt/backups/bin/mysql-restore.sh --list
/opt/backups/bin/mysql-restore.sh --from <SET> --db yourhires --into restore_test
mysql> DROP DATABASE restore_test;
```

Optionally set `HEARTBEAT_URL` to a free healthchecks.io check. There is no
SMTP on this box, so without it nothing tells you when backups stop.

## Restoring

```bash
/opt/backups/bin/mysql-restore.sh --list
/opt/backups/bin/mysql-restore.sh --from 2026-08-29_0200 --db yourbooksuit --into restore_test
```

Restoring **over** a live database requires naming it in `--into` and typing
that name at a prompt. Before overwriting anything it takes a safety dump into
`/opt/backups/mysql/pre-restore/`, so a wrong restore is still recoverable.
Restart the affected app afterwards if it caches connections or schema.

## Design notes

**Per-database dumps, not `--all-databases`.** The realistic failure is "someone
dropped a table in one app", not "the server is gone". Per-database files make
that a one-line restore instead of hand-editing a huge combined dump.

**`--single-transaction`.** All five apps stay live during the dump. On InnoDB
this is a consistent snapshot without locking writers.

**The completion marker is the real integrity check.** A dump that failed
half-way still compresses cleanly, so `gzip -t` alone is not enough — both the
backup and restore scripts require mysqldump's own `-- Dump completed` line.
The size floor (`MIN_DUMP_BYTES`, 100) only catches an empty file: a valid dump
of a small database is around 750 bytes gzipped, so **do not raise it** — a
1024-byte floor was tried and rejected valid backups.

**A partial backup set fails loudly.** If any database fails to dump, the run
exits non-zero and systemd records a failure, rather than leaving a set that
looks complete but isn't.

**Retention** is 7 daily + 4 weekly (Sunday runs go to the weekly tier), with a
`MIN_FREE_MB` guard of 4 GB before dumping, because this disk is 40 GB and was
at 24% at last check.

## Checking on it

```bash
systemctl list-timers midway-backup.timer
systemctl status midway-backup.service
journalctl -u midway-backup.service --since yesterday
du -sh /opt/backups/mysql/*
```

## Verified

Backup and restore were exercised end-to-end against MySQL 8.0.46 before
release: dump and verify, corrupted archive refused, truncated-but-valid-gzip
archive refused, real restore with data intact, rotation pruning to exactly
`KEEP_DAILY`, wrong confirmation leaving a live database untouched, and the
pre-restore safety dump containing the overwritten rows.

The scripts have **not** yet been run on the VPS itself — item 3 above is
still yours to do.

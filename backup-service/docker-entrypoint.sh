#!/bin/bash
# Runs as root only long enough to fix ownership of the host bind-mounted
# /backups directory (its host-side ownership is unknown at image-build
# time, unlike a named volume), then drops to a non-root user for the
# actual backup/restore/API process via su-exec.
set -e

chown -R backupuser:backupgroup /backups

exec su-exec backupuser:backupgroup "$@"

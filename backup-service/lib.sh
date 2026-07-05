#!/bin/bash
# Shared helpers for backup.sh and restore.sh.
#
# Provides a single filesystem lock so a scheduled backup, a manually
# triggered backup, and a restore can never run concurrently against the
# same databases/containers, regardless of which entry point started them.
# `mkdir` is used because it is atomic even on the bind-mounted host
# filesystem this container uses for /backups.

LOCK_DIR="${BACKUP_DIR:-/backups}/.lock"

# Acquires the shared backup/restore lock. Fails fast (single attempt) rather
# than blocking, since callers (the Node trigger API, the nightly loop) each
# decide for themselves how to report "already running" to their caller.
# Automatically steals the lock if the previous holder's PID is no longer
# alive (e.g. the container was killed mid-run).
acquire_lock() {
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    echo $$ > "$LOCK_DIR/pid"
    return 0
  fi

  local holder_pid
  holder_pid=$(cat "$LOCK_DIR/pid" 2>/dev/null || echo "")
  if [ -n "$holder_pid" ] && ! kill -0 "$holder_pid" 2>/dev/null; then
    echo "Stale lock held by dead PID $holder_pid — removing and retrying."
    rm -rf "$LOCK_DIR"
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      echo $$ > "$LOCK_DIR/pid"
      return 0
    fi
  fi

  echo "ERROR: Could not acquire backup lock ($LOCK_DIR) — another backup or restore is already running."
  return 1
}

# Releases the lock, but only if this process is the one holding it (avoids a
# slow process releasing a lock that a later, faster one has since acquired).
release_lock() {
  if [ -f "$LOCK_DIR/pid" ] && [ "$(cat "$LOCK_DIR/pid" 2>/dev/null)" = "$$" ]; then
    rm -rf "$LOCK_DIR"
  fi
}

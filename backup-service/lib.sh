#!/bin/bash
# Shared helpers for backup.sh and restore.sh.
#
# Provides a single filesystem lock so a scheduled backup, a manually
# triggered backup, and a restore can never run concurrently against the
# same databases/containers, regardless of which entry point started them.
# `mkdir` is used because it is atomic even on the bind-mounted host
# filesystem this container uses for /backups.
#
# Also provides send_smtp_mail(), a generic-SMTP email helper used by
# backup.sh's send_alert() for critical-alert notifications.

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

# Sends a plain-text email via curl's built-in SMTP support — no extra
# packages needed beyond the curl already present in this image. Works with
# any SMTP relay/provider (no vendor-specific API). Returns non-zero (no
# output) if SMTP isn't configured or the send fails; callers decide how to
# log that.
#
# Usage: send_smtp_mail <to-address> <subject> <body>
send_smtp_mail() {
  local to="$1"
  local subject="$2"
  local body="$3"

  [ -n "${SMTP_HOST:-}" ] && [ -n "${SMTP_USER:-}" ] && [ -n "${SMTP_PASS:-}" ] || return 1

  local port="${SMTP_PORT:-587}"
  local from="${SMTP_FROM:-noreply@example.com}"
  # --mail-from wants a bare address, not the "Name <addr>" display form
  # SMTP_FROM may be written in.
  local from_addr
  from_addr=$(printf '%s' "$from" | grep -oE '[^<[:space:]]+@[^>[:space:]]+' | head -n1)
  [ -n "$from_addr" ] || from_addr="$from"

  # STARTTLS (SMTP_STARTTLS=true, default) uses smtp:// + --ssl-reqd to force
  # the upgrade; implicit TLS (SMTP_STARTTLS=false, typically port 465) uses
  # smtps:// directly.
  local scheme="smtp"
  local curl_tls_args=(--ssl-reqd)
  if [ "${SMTP_STARTTLS:-true}" = "false" ]; then
    scheme="smtps"
    curl_tls_args=()
  fi

  printf 'From: %s\r\nTo: %s\r\nSubject: %s\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s\r\n' \
    "$from" "$to" "$subject" "$body" |
    curl -s --url "${scheme}://${SMTP_HOST}:${port}" \
      "${curl_tls_args[@]}" \
      --mail-from "<$from_addr>" \
      --mail-rcpt "<$to>" \
      --user "${SMTP_USER}:${SMTP_PASS}" \
      --upload-file - \
      >/dev/null 2>&1
}

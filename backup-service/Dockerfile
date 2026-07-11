FROM alpine:3.21

RUN apk add --no-cache \
    mongodb-tools \
    curl \
    rclone \
    tar \
    gzip \
    bash \
    docker-cli \
    jq \
    nodejs \
    npm \
    su-exec \
    postgresql16-client

RUN addgroup -S backupgroup && adduser -S backupuser -G backupgroup

COPY lib.sh /lib.sh
COPY backup.sh /backup.sh
COPY restore.sh /restore.sh
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /backup.sh /restore.sh /docker-entrypoint.sh

COPY api/package.json /backup-api/package.json
RUN cd /backup-api && npm install --omit=dev --no-audit --no-fund
COPY api/ /backup-api/
RUN chown -R backupuser:backupgroup /backup-api /lib.sh /backup.sh /restore.sh

# Runs as root just long enough to chown the /backups bind mount, then drops
# to backupuser for the real process — see docker-entrypoint.sh.
ENTRYPOINT ["/docker-entrypoint.sh"]

# The actual schedule is driven by docker-compose's `command:` (a sleep loop,
# not real cron — see docs/runbook.md), which also starts the internal
# backup-api HTTP server used by the admin panel. This CMD is a fallback for
# running the image standalone without compose.
CMD ["/bin/bash", "-c", "node /backup-api/server.js & sleep 120 && while true; do BACKUP_TRIGGER=scheduled /backup.sh; sleep 86400; done"]

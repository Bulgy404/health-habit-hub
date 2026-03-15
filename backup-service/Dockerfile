FROM alpine:latest

RUN apk add --no-cache \
    mongodb-tools \
    curl \
    tar \
    gzip \
    bash \
    docker-cli \
    jq

COPY backup.sh /backup.sh
COPY restore.sh /restore.sh
RUN chmod +x /backup.sh /restore.sh

# Setup daily cron at 02:00
RUN echo "0 2 * * * /backup.sh" > /var/spool/cron/crontabs/root

CMD ["crond", "-f"]

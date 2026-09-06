# Analytics VM deployment

This directory turns PostHog's official self-hosted Docker stack into a
repeatable, private-only Health Habit Hub deployment. It does not contain a
second hand-maintained copy of PostHog. `manage.sh prepare` checks out the exact
upstream commit recorded in `.env`, copies its official Compose files into the
ignored `runtime/` directory, and layers `docker-compose.override.yml` on top.
The PostHog application, Node workers, and upstream services that otherwise use
mutable `master` tags are pinned to registry digests recorded on 2026-09-05.

Nothing in this directory starts automatically. The repository can be merged
and deployed to `habitvm` with all analytics variables blank; no PostHog route
or remote monitoring target exists until an administrator enables it.

## What runs

The pinned upstream stack currently consists of separate containers for
PostgreSQL, Redis, Valkey, ClickHouse, ZooKeeper, Kafka/Redpanda, PostHog web and
workers, ingestion/capture workers, object storage, Temporal, and supporting
services. This package adds node-exporter and cAdvisor. Only these host ports
are published, all bound to `POSTHOG_BIND_ADDRESS`:

| Port | Purpose | Allowed source |
| --- | --- | --- |
| `8000` | PostHog HTTP (ingest and private admin UI) | `habitvm` and trusted admin network |
| `9100` | node-exporter | `habitvm` only |
| `8080` | cAdvisor | `habitvm` only |

The upstream defaults that expose object storage, Temporal, and its UI are
explicitly removed by the override. TLS remains on `habitvm`; traffic between
the two VMs uses the private TU network.

## First deployment on the future VM

Prerequisites: Ubuntu LTS, Git, curl, brotli, Docker Engine, and Docker Compose
2.24.4 or newer. Mount the ext4 data disk at `/data` and configure Docker's
`data-root` as `/data/docker` **before the first pull**. `manage.sh up` refuses
to proceed when Docker reports a different root.

```bash
cp -a analytics-vm /opt/hhh-analytics-config
cd /opt/hhh-analytics-config
./manage.sh init
editor .env
./manage.sh doctor
./manage.sh prepare
./manage.sh config
./manage.sh up
```

`doctor` verifies Linux, CPU architecture, at least 16 GB RAM, ext4, Docker's
data-root, Compose 2.24.4+, secret formats, `.env` permissions and immutable
image digests. `prepare` only downloads the pinned source and GeoIP database.
`config` only renders the merged configuration. `up` is the first action that
pulls images and starts containers, and it runs `doctor` again first.

Generate the three 64-hex secrets independently and generate the 32-hex salt
separately; never reuse one output for another variable:

```bash
openssl rand -hex 32  # POSTHOG_SECRET
openssl rand -hex 32  # BROWSERLESS_SECRET
openssl rand -hex 32  # INTERNAL_API_SECRET
openssl rand -hex 16  # ENCRYPTION_SALT_KEYS
```

Keep `.env` and the Docker volumes out of Git and in the VM backup. Never rotate
`POSTHOG_SECRET` or `ENCRYPTION_SALT_KEYS` on a running deployment.

## Connect habitvm after the address is known

Set these in the main stack environment and redeploy only the main stack:

```dotenv
POSTHOG_INTERNAL_URL=http://<analytics-private-ip>:8000
POSTHOG_SERVER_HOST=http://<analytics-private-ip>:8000
POSTHOG_PROJECT_KEY=phc_project_key_from_posthog
ANALYTICS_VM_HOST=<analytics-private-ip>
```

Traefik then enables only the public `/ingest` endpoint allowlist. Prometheus
starts scraping the analytics VM's node-exporter and cAdvisor targets. The
PostHog admin UI is never routed through the public `habitvm` domain.

In the VM firewall, allow TCP 8000, 9100, and 8080 from `habitvm`'s private IP
only. If administrators need direct UI access, allow 8000 from the trusted admin
network or use an SSH tunnel.

## Connect the Flutter app after creating the PostHog project

Set these compile-time values in the production Dart-defines file:

```json
{
  "POSTHOG_PROJECT_KEY": "phc_project_key_from_posthog",
  "POSTHOG_HOST": "https://habit.wiwi.tu-dresden.de/ingest"
}
```

The project key is a write-only ingestion identifier, not an administrative API
key. The mobile SDK must never receive the private analytics-VM address.

## Operations

```bash
./manage.sh status
./manage.sh logs web
./manage.sh backup
./manage.sh stop
```

### Backups

`backup` creates a custom-format PostgreSQL dump and a consistent ClickHouse
snapshot using the separately pinned `clickhouse-backup` helper container. It
writes SHA-256 checksums and offsite status to a JSON manifest, removes the
temporary ClickHouse snapshot after archiving it, and retains local files for
`ANALYTICS_BACKUP_RETENTION_DAYS` (14 by default). Kafka is intentionally not
backed up because it is a transient transport, not the event system of record.

Set `OFFSITE_REMOTE` to a host-configured rclone destination such as
`tu-s3:hhh-backups`; when blank the manifest explicitly records
`"offsite": false`. Install the supplied systemd unit and timer for daily runs:

```bash
sudo install -m 0644 systemd/hhh-analytics-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hhh-analytics-backup.timer
systemctl list-timers hhh-analytics-backup.timer
```

Before a study, restore both files into a scratch copy of the same pinned stack,
verify their manifest checksums, and confirm a known event is queryable. Restore
is intentionally not exposed as an unattended `manage.sh` action: it replaces
live databases and must remain a witnessed, documented maintenance operation.

`stop` retains every Docker volume. Upgrade by testing a new immutable upstream
revision off-study, updating both revision values in `.env`, running `prepare`
and `config`, taking a backup, and only then running `up`.

PostHog treats this as an unsupported hobby deployment and changes the stack
frequently. The pinned revision is intentional; do not replace it with `master`,
`latest`, or an unreviewed automatic update.

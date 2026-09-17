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

## Host findings from habitvmmonitoring (2026-09-16)

Measured on the provisioned VM. Each of these broke a deployment attempt.

### `data-root` alone is not enough on Docker 29+

Docker 29 defaults to the containerd image store, and image layers live under
`/var/lib/containerd`, which **`data-root` does not govern**. Setting
`data-root` to `/data/docker` and pulling filled the 10 GB `/var` volume to 100%
while `/data/docker` held 206 MB. Point containerd at the data disk too, then
verify after any Docker upgrade:

```bash
df -h /var /data && readlink -f /var/lib/containerd
```

### Pin Docker's address pools

The VM's own subnet is `172.26.52.0/22`, which falls **inside** Docker's default
`172.17.0.0/12` pool. A bridge allocated there blackholes the host's own default
gateway. Pin them in `/etc/docker/daemon.json`:

```json
{ "default-address-pools": [
  { "base": "172.17.0.0/16", "size": 24 },
  { "base": "172.18.0.0/15", "size": 24 },
  { "base": "172.20.0.0/14", "size": 24 }
] }
```

A default bridge that comes up as `/24` rather than `/16` confirms it took.

### Root's umask is 077 on ZIH VMs

Everything created as root is `drwx------`, and containers run as non-root
(Postgres is uid 70). Symptom: Postgres restart-loops on
`ls: can't open '/docker-entrypoint-initdb.d/': Permission denied`, surfacing
only as "container is unhealthy". After creating or refreshing anything the
stack bind-mounts:

```bash
chmod -R go+rX <path>
chmod 600 <path>/.env   # re-tighten, it holds POSTHOG_SECRET
```

Capital `X` adds execute to directories only. Grant `group` **and** `other` —
several images run as a non-root uid whose group is `0`, and Linux checks the
first matching class.

### The 16 GB check in `doctor` is not conservative

The VM was provisioned with **12 GB** (11.6 GiB usable), below `doctor`'s
threshold. Started anyway for measurement: 37 containers idled at 8.9 GiB, then
first-run migrations exhausted memory — **30 OOM kills** (including `systemd`
and `sd-pam`, which made the host unreachable by SSH) and a load average of 505.
Do not bypass `doctor` on this point. 32 GB was requested; the VM now runs on
**24 GB** (23.6 GiB usable), which is enough — the stack idles at 12.8 GiB with
11.4 GiB available.

### Swap is sized for `Committed_AS`, not for paging

Swap was raised from 5 GiB to **16 GiB on 2026-09-17**. Not because the host
runs out of memory, but because ZIH's Checkmk `Memory` check warns when
`Committed_AS` exceeds RAM + swap. This stack commits roughly 33 GiB of address
space while resident in 12.8 — ClickHouse alone reserves 11.3 GiB of `VmData`
against 819 MiB RSS — so the check sat permanently at WARN (114.8%) with no
underlying fault. At 16 GiB it reads 86%.

It is also a real net. Every OOM kill this deployment has had (`web`, `worker`,
`temporal-django-worker`) happened with swap at 0 B used and nowhere to spill;
Docker gives a container swap equal to its `mem_limit` when `memswap_limit` is
unset, so the headroom now reaches the cgroups that were dying.

Two things to know before touching it. `vm.swappiness` is **0**
(`/etc/sysctl.d/40-swappiness.conf`) — that does not disable swap, it only stops
proactive paging, which is what you want from a net. And the extension left VG
`main` with **3.5 GiB unallocated** instead of 14.5, so there is much less room
to grow `/` or `/var` in an emergency; a swapfile on `/data` is the alternative
if that headroom is ever needed back.

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

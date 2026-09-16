# Self-hosted PostHog — `habitvmmonitoring`

Product-analytics stack for the study platform. Runs on its own TU-internal VM,
**not** on `habitvm`. Design rationale, event taxonomy and retention policy live
in [docs/analytics-posthog-plan.md](../docs/analytics-posthog-plan.md).

| | |
|---|---|
| Host | `habitvmmonitoring`, `172.26.52.166/22` (TU-internal only) |
| Access | `ssh root@habitvmmonitoring` (key-only; `service` is sudo-capable) |
| Portainer | stack `posthog` on environment `habitvmmonitoring`, agent 2.21.1 |
| Data disk | `/dev/sdb`, 492 GB ext4, label `hhh-data`, mounted `/data` |
| Admin UI | **never exposed** — reach it over an SSH tunnel (below) |

## Host prerequisites (one-time, already done 2026-09-16)

This compose file is **not self-contained**. Like habitvm's stack, it bind-mounts
config out of a repository checkout — ClickHouse's `config.xml`, `users.xml`, the
init scripts, the protobuf IDL, and `.env.services`. Those come from PostHog's own
repo, which must be cloned on the host:

```bash
mkdir -p /data/posthog && cd /data/posthog
git clone --depth 1 https://github.com/PostHog/posthog.git
```

### The generated `compose/` entrypoints

`web` and `temporal-django-worker` run `/compose/start` and
`/compose/temporal-django-worker`. **These scripts are not in PostHog's repo** —
upstream's `deploy-hobby` writes them at install time, so a Git-deployed stack can
never produce them. Without them the deploy fails with:

```
exec: "/compose/start": stat /compose/start: no such file or directory
```

Copies are kept in `posthog/compose/` here. Place them next to the clone:

```bash
mkdir -p /data/posthog/compose
# copy start, temporal-django-worker and wait from posthog/compose/ in this repo
chmod 755 /data/posthog/compose/*
```

Re-check these after a PostHog upgrade — if upstream changes what `deploy-hobby`
writes, these copies go stale silently.

`POSTHOG_REPO_DIR` defaults to `/data/posthog` — the **parent** of the clone, not
the clone itself. Upstream's `deploy-hobby` copies the compose files one level
above the checkout, so `./posthog/docker/...` paths point into it while `./share`,
`./compose`, `./products` and `./docker/postgres-init-scripts` resolve to sibling
directories that do not exist in a stock install either. Those four are created
empty (they mount onto `/share`, `/compose`, `/products` and
`/docker-entrypoint-initdb.d`, none of which shadow application code). Override
the variable only if the clone's parent is elsewhere. **There is no `config-sync` equivalent here** — this
clone does not self-update. Refresh it by hand before an upgrade:

```bash
cd /data/posthog/posthog && git pull
```

### File permissions — required, and easy to miss

This VM's root account has a **`077` umask**, so anything created there is
`drwx------` and unreadable by containers, which run as non-root (Postgres is
uid 70). Symptom: Postgres restart-loops with

```
ls: can't open '/docker-entrypoint-initdb.d/': Permission denied
```

and the stack deploy aborts with `dependency failed to start: container
posthog-db-1 is unhealthy`. After creating or refreshing anything under
`/data/posthog`:

```bash
chmod -R go+rX /data/posthog
chmod 600 /data/posthog/posthog/.env   # re-tighten, it holds POSTHOG_SECRET
```

Capital `X` adds execute to directories only, never to regular files. Grant both
`group` and `other` — several images run as a non-root uid whose group is `0`, and
Linux checks the first matching class, so `other`-only permissions are ignored.
Re-run this after every `git pull` in the checkout.

### Docker storage — the containerd trap

Setting `data-root` is **not sufficient on Docker 29+**. The default containerd
image store keeps layers under `/var/lib/containerd`, which `data-root` does not
govern, so images land on the 10 GB `/var` volume and fill it. On this host
`/var/lib/containerd` is a symlink to `/data/containerd`. Verify after any Docker
upgrade:

```bash
df -h /var /data && readlink -f /var/lib/containerd
```

Docker's address pools are also pinned in `/etc/docker/daemon.json` to
`172.17`–`172.23`. The host's own subnet is `172.26.52.0/22`, which falls inside
Docker's default `172.17.0.0/12` pool — an unpinned bridge allocated there would
blackhole the machine's own default gateway.

## Environment variables (set in Portainer, not in git)

| Variable | How to produce it |
|---|---|
| `POSTHOG_SECRET` | `head -c 28 /dev/urandom \| sha224sum -b \| head -c 56` |
| `ENCRYPTION_SALT_KEYS` | `openssl rand -hex 16` |
| `BROWSERLESS_SECRET` | `openssl rand -hex 32` |
| `DOMAIN` | `172.26.52.166` |
| `TLS_BLOCK` / `CADDY_TLS_BLOCK` | `tls internal` — **never ACME**; this host must not hold a public certificate |
| `REGISTRY_URL` | `posthog/posthog` |
| `POSTHOG_APP_TAG` | `latest` (see *Known gaps*) |

Rotating `POSTHOG_SECRET` invalidates sessions; rotating `ENCRYPTION_SALT_KEYS`
corrupts already-encrypted data. Set them once and keep them in the password
manager.

## Reaching the admin UI

Self-hosted PostHog has **no SSO** — local email/password accounts only. The UI is
therefore never published. Tunnel to it:

```bash
ssh -N -L 8080:localhost:80 root@habitvmmonitoring
```

Then open `http://localhost:8080`. Create the admin account on first load: an
uninitialised PostHog grants the first visitor ownership.

## Known gaps

- **Images are tagged `:master`/`latest`, not pinned by digest.** The plan doc
  requires digest pinning for a multi-year study. Not yet done.
- **No `mem_limit` on any container.** Upstream ships none, and this host has
  11 GiB, not the 16 GiB the plan doc specced. ClickHouse expands into whatever is
  free. Limits should be set from measured `docker stats`.
- **52 services**, far more than the seven the plan doc anticipated — it now
  includes Temporal, Elasticsearch, SeaweedFS and browserless.
- **Ingest proxying is not wired up.** The Traefik router on habitvm that forwards
  `/ingest` to this host does not exist yet.
- **No disk or memory alerting** on this host.

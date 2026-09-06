#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
env_file="$script_dir/.env"
runtime_dir="$script_dir/runtime"

fail() {
  printf 'analytics-vm: %s\n' "$*" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

validate_image_reference() {
  variable=$1
  value=$2
  case "$value" in
    *@sha256:*)
      image_name=${value%@sha256:*}
      digest=${value##*@sha256:}
      ;;
    *) fail "$variable must include an immutable sha256 digest" ;;
  esac
  [ -n "$image_name" ] || fail "$variable must include an image tag before its digest"
  case "$image_name" in
    *[!A-Za-z0-9._/:@-]*) fail "$variable contains invalid image-reference characters" ;;
  esac
  case "$digest" in
    *[!0-9a-f]*|'') fail "$variable sha256 digest must be lowercase hexadecimal" ;;
  esac
  [ "${#digest}" -eq 64 ] || fail "$variable sha256 digest must contain 64 characters"
}

load_env() {
  [ -f "$env_file" ] || fail "copy .env.example to .env and configure it first"
  set -a
  # This file is administrator-controlled and is also consumed by Docker
  # Compose. Keep values shell-safe (no unquoted spaces or command syntax).
  . "$env_file"
  set +a

  runtime_dir=${POSTHOG_RUNTIME_DIR:-$runtime_dir}
}

validate_env() {
  case "${POSTHOG_BIND_ADDRESS:-}" in
    ''|CHANGE_ME*|0.0.0.0|::|'[::]')
      fail "POSTHOG_BIND_ADDRESS must be the VM's private IP, never a public wildcard"
      ;;
  esac

  case "${POSTHOG_SITE_URL:-}" in
    http://*|https://*) ;;
    *) fail "POSTHOG_SITE_URL must be an http:// or https:// URL" ;;
  esac

  for variable in POSTHOG_UPSTREAM_REVISION POSTHOG_APP_TAG POSTHOG_SECRET ENCRYPTION_SALT_KEYS BROWSERLESS_SECRET INTERNAL_API_SECRET DOMAIN; do
    eval "value=\${$variable:-}"
    case "$value" in
      ''|CHANGE_ME*) fail "$variable is not configured" ;;
    esac
  done

  case "$POSTHOG_UPSTREAM_REVISION" in
    *[!0-9a-f]*|'') fail "POSTHOG_UPSTREAM_REVISION must be a lowercase Git commit hash" ;;
  esac
  [ "${#POSTHOG_UPSTREAM_REVISION}" -eq 40 ] || fail "POSTHOG_UPSTREAM_REVISION must contain 40 characters"

  validate_image_reference POSTHOG_APP_TAG "$POSTHOG_APP_TAG"
  validate_image_reference POSTHOG_NODE_TAG "${POSTHOG_NODE_TAG:-}"

  for variable in POSTHOG_SECRET BROWSERLESS_SECRET INTERNAL_API_SECRET; do
    eval "value=\${$variable:-}"
    case "$value" in
      *[!0-9a-fA-F]*|'') fail "$variable must be a hexadecimal secret" ;;
    esac
    [ "${#value}" -ge 64 ] || fail "$variable must contain at least 64 hexadecimal characters"
  done
  case "$ENCRYPTION_SALT_KEYS" in
    *[!0-9a-fA-F]*|'') fail "ENCRYPTION_SALT_KEYS must be hexadecimal" ;;
  esac
  [ "${#ENCRYPTION_SALT_KEYS}" -ge 32 ] || fail "ENCRYPTION_SALT_KEYS must contain at least 32 hexadecimal characters"

  for variable in POSTHOG_HTTP_PORT; do
    eval "value=\${$variable:-}"
    case "$value" in
      ''|*[!0-9]*) fail "$variable must be a numeric TCP port" ;;
    esac
    [ "$value" -ge 1 ] && [ "$value" -le 65535 ] || fail "$variable must be between 1 and 65535"
  done
}

prepare_runtime() {
  need_command git
  need_command curl
  mkdir -p "$runtime_dir"

  if [ ! -d "$runtime_dir/posthog/.git" ]; then
    [ ! -e "$runtime_dir/posthog" ] || fail "$runtime_dir/posthog exists but is not a Git checkout"
    git clone --filter=blob:none --no-checkout https://github.com/PostHog/posthog.git "$runtime_dir/posthog"
  fi

  git -C "$runtime_dir/posthog" fetch --depth 1 origin "$POSTHOG_UPSTREAM_REVISION"
  git -C "$runtime_dir/posthog" checkout --detach "$POSTHOG_UPSTREAM_REVISION"
  actual_revision=$(git -C "$runtime_dir/posthog" rev-parse HEAD)
  [ "$actual_revision" = "$POSTHOG_UPSTREAM_REVISION" ] || fail "checked-out PostHog revision does not match .env"

  cp "$runtime_dir/posthog/docker-compose.hobby.yml" "$runtime_dir/docker-compose.yml"
  cp "$runtime_dir/posthog/docker-compose.base.yml" "$runtime_dir/docker-compose.base.yml"
  cp "$runtime_dir/posthog/.env.services" "$runtime_dir/.env.services"

  mkdir -p "$runtime_dir/compose" "$runtime_dir/share"
  cp "$script_dir/templates/compose/start" "$runtime_dir/compose/start"
  cp "$script_dir/templates/compose/wait" "$runtime_dir/compose/wait"
  cp "$script_dir/templates/compose/temporal-django-worker" "$runtime_dir/compose/temporal-django-worker"
  chmod 0755 "$runtime_dir/compose/start" "$runtime_dir/compose/wait" "$runtime_dir/compose/temporal-django-worker"

  if [ ! -s "$runtime_dir/share/GeoLite2-City.mmdb" ]; then
    need_command brotli
    curl -fsSL --http1.1 https://mmdbcdn.posthog.net/ -o "$runtime_dir/share/GeoLite2-City.mmdb.br"
    brotli --decompress --force \
      --output="$runtime_dir/share/GeoLite2-City.mmdb" \
      "$runtime_dir/share/GeoLite2-City.mmdb.br"
    rm "$runtime_dir/share/GeoLite2-City.mmdb.br"
  fi

  printf '{"revision":"%s"}\n' "$actual_revision" > "$runtime_dir/upstream-lock.json"
  printf 'Prepared PostHog %s in %s\n' "$actual_revision" "$runtime_dir"
}

compose() {
  docker compose \
    --env-file "$env_file" \
    --project-name "${COMPOSE_PROJECT_NAME:-hhh-analytics}" \
    --project-directory "$runtime_dir" \
    -f "$runtime_dir/docker-compose.yml" \
    -f "$script_dir/docker-compose.override.yml" \
    "$@"
}

check_docker_root() {
  expected_root=${ANALYTICS_DOCKER_ROOT:-/data/docker}
  actual_root=$(docker info --format '{{.DockerRootDir}}')
  [ "$actual_root" = "$expected_root" ] || fail "Docker data root is $actual_root; expected $expected_root. Move it before the first pull, or correct ANALYTICS_DOCKER_ROOT."
}

version_at_least() {
  first=$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n 1)
  [ "$first" = "$2" ]
}

doctor() {
  need_command docker
  need_command git
  need_command curl
  need_command brotli
  need_command findmnt
  need_command sort

  compose_version=$(docker compose version --short | sed 's/^v//')
  version_at_least "$compose_version" "2.24.4" || fail "Docker Compose $compose_version is too old; 2.24.4 or newer is required"
  check_docker_root

  expected_root=${ANALYTICS_DOCKER_ROOT:-/data/docker}
  data_mount=$(dirname "$expected_root")
  [ -d "$data_mount" ] || fail "$data_mount does not exist; mount the data disk first"
  filesystem=$(findmnt -n -o FSTYPE --target "$data_mount")
  [ "$filesystem" = "ext4" ] || fail "$data_mount uses $filesystem; the reviewed deployment requires ext4"

  case "$(uname -m)" in
    x86_64|aarch64|arm64) ;;
    *) fail "unsupported CPU architecture: $(uname -m)" ;;
  esac
  [ "$(uname -s)" = "Linux" ] || fail "the analytics package is supported on Linux only"

  memory_kib=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
  [ "${memory_kib:-0}" -ge 15000000 ] || fail "at least 16 GB RAM is required for the pinned multi-service PostHog stack"

  env_mode=$(stat -c '%a' "$env_file")
  [ "$env_mode" = "600" ] || fail "$env_file permissions are $env_mode; run chmod 600 $env_file"

  printf 'Preflight passed: Linux %s, Compose %s, %s on %s, Docker root %s.\n' \
    "$(uname -m)" "$compose_version" "$data_mount" "$filesystem" "$expected_root"
}

backup() {
  backup_dir=${ANALYTICS_BACKUP_DIR:-/data/posthog-backups}
  retention_days=${ANALYTICS_BACKUP_RETENTION_DAYS:-14}
  case "$retention_days" in
    ''|*[!0-9]*) fail "ANALYTICS_BACKUP_RETENTION_DAYS must be a positive integer" ;;
  esac
  [ "$retention_days" -ge 1 ] || fail "ANALYTICS_BACKUP_RETENTION_DAYS must be at least 1"
  mkdir -p "$backup_dir"
  [ -w "$backup_dir" ] || fail "$backup_dir is not writable"

  stamp=$(date -u '+%Y%m%dT%H%M%SZ')
  name="hhh-analytics-$stamp"
  postgres_tmp="$backup_dir/$name-postgres.dump.tmp"
  postgres_file="$backup_dir/$name-postgres.dump"
  clickhouse_file="$backup_dir/$name-clickhouse.tar.gz"
  manifest_file="$backup_dir/$name-manifest.json"

  compose exec -T db pg_dump -U posthog -F c posthog > "$postgres_tmp"
  [ -s "$postgres_tmp" ] || fail "PostgreSQL backup is empty"
  mv "$postgres_tmp" "$postgres_file"

  compose --profile ops run --rm clickhouse-backup create "$name"
  compose --profile ops run --rm --entrypoint sh clickhouse-backup -c \
    "tar -C /var/lib/clickhouse/backup -czf /backup-output/$name-clickhouse.tar.gz $name"
  [ -s "$clickhouse_file" ] || fail "ClickHouse backup archive is empty"
  compose --profile ops run --rm clickhouse-backup delete local "$name"

  postgres_sha=$(sha256sum "$postgres_file" | awk '{ print $1 }')
  clickhouse_sha=$(sha256sum "$clickhouse_file" | awk '{ print $1 }')
  offsite=false
  if [ -n "${OFFSITE_REMOTE:-}" ]; then
    need_command rclone
    rclone copy "$postgres_file" "$OFFSITE_REMOTE/analytics/$name/"
    rclone copy "$clickhouse_file" "$OFFSITE_REMOTE/analytics/$name/"
    offsite=true
  fi
  printf '{"name":"%s","createdAt":"%s","postgres":{"file":"%s","sha256":"%s"},"clickhouse":{"file":"%s","sha256":"%s"},"offsite":%s}\n' \
    "$name" "$stamp" "$(basename "$postgres_file")" "$postgres_sha" \
    "$(basename "$clickhouse_file")" "$clickhouse_sha" "$offsite" > "$manifest_file"
  if [ "$offsite" = true ]; then
    rclone copy "$manifest_file" "$OFFSITE_REMOTE/analytics/$name/"
  fi

  find "$backup_dir" -maxdepth 1 -type f -name 'hhh-analytics-*' \
    -mtime "+$retention_days" -delete
  printf 'Backup complete: %s (offsite=%s)\n' "$manifest_file" "$offsite"
}

action=${1:-help}

case "$action" in
  init)
    if [ -e "$env_file" ]; then
      fail "$env_file already exists; refusing to overwrite it"
    fi
    cp "$script_dir/.env.example" "$env_file"
    chmod 0600 "$env_file"
    printf 'Created %s. Fill in the CHANGE_ME values, then run: %s prepare\n' "$env_file" "$0"
    ;;
  prepare)
    load_env
    validate_env
    prepare_runtime
    ;;
  config)
    load_env
    validate_env
    [ -f "$runtime_dir/docker-compose.yml" ] || fail "run '$0 prepare' first"
    need_command docker
    compose config --quiet
    printf 'Merged Compose configuration is valid. No containers were started.\n'
    ;;
  doctor)
    load_env
    validate_env
    doctor
    ;;
  up)
    load_env
    validate_env
    need_command docker
    doctor
    prepare_runtime
    compose pull
    compose up -d --no-build
    compose ps
    ;;
  status)
    load_env
    need_command docker
    compose ps
    ;;
  backup)
    load_env
    validate_env
    need_command docker
    need_command sha256sum
    [ -f "$runtime_dir/docker-compose.yml" ] || fail "run '$0 prepare' first"
    backup
    ;;
  logs)
    load_env
    need_command docker
    shift || true
    compose logs --tail 200 "$@"
    ;;
  stop)
    load_env
    need_command docker
    compose stop
    ;;
  *)
    cat <<EOF
Usage: $0 ACTION

  init       Create a private .env from the tracked template
  prepare    Download the pinned official PostHog source; start nothing
  config     Render the final merged Compose configuration; start nothing
  doctor     Verify host, filesystem, Docker, resources, secrets and image pins
  up         Run doctor, pull images, and start the stack
  status     Show container health/status
  backup     Back up PostgreSQL + ClickHouse, then optionally copy offsite
  logs [svc] Show recent logs, optionally for one service
  stop       Stop containers without deleting volumes
EOF
    ;;
esac

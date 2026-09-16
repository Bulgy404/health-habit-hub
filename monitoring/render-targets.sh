#!/bin/sh
set -eu

target_dir=${TARGET_DIR:-/targets}
host=${ANALYTICS_VM_HOST:-}
posthog_port=${ANALYTICS_VM_POSTHOG_PORT:-8000}

mkdir -p "$target_dir"

if [ -z "$host" ]; then
  printf '[]\n' > "$target_dir/analytics-node-exporter.json"
  printf '[]\n' > "$target_dir/analytics-cadvisor.json"
  printf '[]\n' > "$target_dir/analytics-posthog.json"
  exit 0
fi

# Accept an IP address or DNS hostname only. Ports and schemes are supplied by
# this script so a malformed setting cannot turn Prometheus into an arbitrary
# URL fetcher.
case "$host" in
  *[!A-Za-z0-9._-]*)
    echo "ANALYTICS_VM_HOST must be an IP address or DNS hostname without a scheme or port" >&2
    exit 1
    ;;
esac

case "$posthog_port" in
  ''|*[!0-9]*)
    echo "ANALYTICS_VM_POSTHOG_PORT must be a numeric TCP port" >&2
    exit 1
    ;;
esac
if [ "$posthog_port" -lt 1 ] || [ "$posthog_port" -gt 65535 ]; then
  echo "ANALYTICS_VM_POSTHOG_PORT must be between 1 and 65535" >&2
  exit 1
fi

printf '[{"targets":["%s:9100"],"labels":{"host":"analyticsvm"}}]\n' "$host" \
  > "$target_dir/analytics-node-exporter.json"
printf '[{"targets":["%s:8080"],"labels":{"host":"analyticsvm"}}]\n' "$host" \
  > "$target_dir/analytics-cadvisor.json"
printf '[{"targets":["http://%s:%s/_health"],"labels":{"host":"analyticsvm","service":"posthog"}}]\n' "$host" "$posthog_port" \
  > "$target_dir/analytics-posthog.json"

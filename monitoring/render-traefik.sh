#!/bin/sh
set -eu

template=${TRAEFIK_TEMPLATE:-/config/posthog-ingest.yml.tmpl}
output=${TRAEFIK_OUTPUT:-/dynamic/posthog-ingest.yml}
posthog_url=${POSTHOG_INTERNAL_URL:-}

mkdir -p "$(dirname "$output")"

# Blank configuration is the feature flag: keep the file provider valid while
# defining no public route until the future analytics VM exists.
if [ -z "$posthog_url" ]; then
  printf 'http: {}\n' > "$output"
  exit 0
fi

domain=${DOMAIN:-}
rate_average=${POSTHOG_INGEST_RATE_AVERAGE:-100}
rate_burst=${POSTHOG_INGEST_RATE_BURST:-200}

case "$posthog_url" in
  http://*) authority=${posthog_url#http://} ;;
  https://*) authority=${posthog_url#https://} ;;
  *)
    echo 'POSTHOG_INTERNAL_URL must be an http:// or https:// origin' >&2
    exit 1
    ;;
esac

# Accept a simple IPv4/DNS origin with an optional numeric port. Paths,
# credentials, IPv6 ambiguity and shell/YAML metacharacters are rejected before
# substitution. IPv6 can be added later with an explicit bracket-aware parser.
case "$authority" in
  *:*)
    host=${authority%:*}
    port=${authority##*:}
    case "$host" in
      *:*)
        echo 'POSTHOG_INTERNAL_URL currently supports DNS names and IPv4 only' >&2
        exit 1
        ;;
    esac
    case "$port" in
      ''|*[!0-9]*)
        echo 'POSTHOG_INTERNAL_URL port must be numeric' >&2
        exit 1
        ;;
    esac
    [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || {
      echo 'POSTHOG_INTERNAL_URL port must be between 1 and 65535' >&2
      exit 1
    }
    ;;
  *) host=$authority ;;
esac
case "$host" in
  ''|[.-]*|*[.-]|*[!A-Za-z0-9.-]*)
    echo 'POSTHOG_INTERNAL_URL must contain only a DNS/IPv4 host and optional port, with no path or credentials' >&2
    exit 1
    ;;
esac
case "$domain" in
  ''|[.-]*|*[.-]|*[!A-Za-z0-9.-]*)
    echo 'DOMAIN must be a DNS hostname' >&2
    exit 1
    ;;
esac
for value in "$rate_average" "$rate_burst"; do
  case "$value" in
    ''|*[!0-9]*)
      echo 'PostHog ingest rate limits must be positive integers' >&2
      exit 1
      ;;
  esac
  [ "$value" -ge 1 ] || {
    echo 'PostHog ingest rate limits must be positive integers' >&2
    exit 1
  }
done

temporary="$output.tmp"
sed \
  -e "s|__DOMAIN__|$domain|g" \
  -e "s|__RATE_AVERAGE__|$rate_average|g" \
  -e "s|__RATE_BURST__|$rate_burst|g" \
  -e "s|__POSTHOG_INTERNAL_URL__|$posthog_url|g" \
  "$template" > "$temporary"
mv "$temporary" "$output"

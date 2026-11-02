#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-ipa}"
if [[ $# -gt 0 ]]; then shift; fi
if [[ "$target" != "ipa" && "$target" != "ios" ]]; then
  echo "Usage: bash tool/build_ios.sh [ipa|ios] [Flutter build options]" >&2
  exit 1
fi
if [[ -e pubspec_overrides.yaml ]]; then
  echo "An existing pubspec_overrides.yaml must be reviewed before this release build." >&2
  exit 1
fi

flutter pub get
release_tmp="$(mktemp -d "${TMPDIR:-/tmp}/hhh-ios-release.XXXXXX")"
cp pubspec.lock "$release_tmp/pubspec.lock"
cleanup() {
  cp "$release_tmp/pubspec.lock" pubspec.lock
  rm -f pubspec_overrides.yaml
  rm -rf "$release_tmp"
}
trap cleanup EXIT

python3 tool/patch_ios_plugins.py --prepare
flutter pub get
flutter build "$target" --release --dart-define-from-file=dart_defines_prod.json "$@"

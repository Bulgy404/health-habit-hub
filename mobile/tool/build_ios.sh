#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

target="${1:-ipa}"
if [[ $# -gt 0 ]]; then shift; fi
if [[ "$target" != "ipa" && "$target" != "ios" ]]; then
  echo "Usage: bash tool/build_ios.sh [ipa|ios] [Flutter build options]" >&2
  exit 1
fi
# Compatibility shortcut for earlier instructions. Native fixes are now regular
# dependencies, so Xcode and plain `flutter build ipa` work without this helper.
flutter pub get
flutter build "$target" --release --dart-define-from-file=dart_defines_prod.json "$@"

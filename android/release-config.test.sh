#!/usr/bin/env bash
# A release build without the Firebase configuration must fail (the app would have no AI client);
# with it, the release build passes. Moves app/google-services.json aside for the first check and
# always puts it back. Local only: CI has no google-services.json and builds debug only.
set -uo pipefail
cd "$(dirname "$0")"
cfg=app/google-services.json
[ -s "$cfg" ] || { echo "release-config.test: $cfg is needed for this test" >&2; exit 2; }
aside="$(mktemp -d)"
trap 'mv "$aside/google-services.json" "$cfg" 2>/dev/null; rmdir "$aside" 2>/dev/null' EXIT
fail=0
mv "$cfg" "$aside/google-services.json"
out="$(./gradlew --no-daemon -q :app:assembleRelease 2>&1)"; rc=$?
if [ $rc -ne 0 ] && grep -q "needs app/google-services.json" <<<"$out"; then echo "ok: a release build without the Firebase configuration fails"; else echo "FAIL: without the configuration the release build gave exit $rc"; fail=1; fi
mv "$aside/google-services.json" "$cfg"
./gradlew --no-daemon -q :app:assembleRelease > /dev/null 2>&1; rc=$?
if [ $rc -eq 0 ]; then echo "ok: with it, the release build passes"; else echo "FAIL: with the configuration the release build gave exit $rc"; fail=1; fi
exit $fail

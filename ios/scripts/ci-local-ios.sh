#!/usr/bin/env bash
# Every check for the iPhone client's commits: the repository's CI steps (.github/workflows/ci.yml)
# in the same order, then the iOS checks. Each command runs bare, so its own exit code decides.
# Run from anywhere: bash ios/scripts/ci-local-ios.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "== repository CI: edition, lint, types, tests, build"
npm run edition:check
npm run lint
npm run typecheck
npm run test
npm run build
built=$(python3 -I -c "import json;print(json.load(open('dist/version.json'))['sha'])")
test "$built" = "$(git rev-parse HEAD)"
if grep -l "/desk/" dist/assets/*.js; then echo "The desk routes reached the production bundle."; exit 1; fi

echo "== repository CI: tone, model guard, public hygiene, secrets, trailers"
npm run tone
npm run guard
REPO_PRIVATE=true npm run hygiene
gitleaks git --redact --exit-code 1 .
if git log --format=%B | grep -i "co-authored-by"; then echo "A commit message carries a co-author trailer."; exit 1; fi

echo "== iOS: model guard and its tests"
python3 -I ios/scripts/test_ios_guard.py
python3 -I ios/scripts/ios_guard.py .

echo "== iOS: the engine file is fresh, and the engine host passes the contract and the shared vectors"
bash ios/scripts/check_engine_bundle.sh
swift test --package-path ios/BYTCore

echo "== iOS: generate the project, app tests on the simulator, unsigned device build"
# The Firebase settings file is gitignored, so a fresh clone or worktree has none. Without it the
# app shows its missing-settings screen and the tests that build the cloud client crash, which
# reads as four unrelated failures. Stop here instead and say why.
settings=ios/BYT/Config/GoogleService-Info.plist
if [ ! -s "$settings" ]; then
  echo "$settings is missing (it is gitignored). Copy it from the Firebase console or another checkout, then run again."
  exit 1
fi
xcodegen generate --spec ios/project.yml --quiet
# Not under $TMPDIR: macOS deletes files there that look older than three days, and unpacked
# package binaries keep their archive dates, so it removed Info.plist files out of the Firebase
# frameworks while their folders stayed, and the build failed.
DD="${BYT_CI_DD:-$HOME/Library/Caches/byt-ci-dd}"
xcodebuild -quiet -project ios/BYT.xcodeproj -scheme BYT -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=27.2' \
  -derivedDataPath "$DD" test
xcodebuild -quiet -project ios/BYT.xcodeproj -scheme BYT -destination 'generic/platform=iOS' -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO build
xcrun simctl shutdown all || true

echo "ci-local-ios: all checks passed"

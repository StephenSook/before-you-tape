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

echo "ci-local-ios: all checks passed"

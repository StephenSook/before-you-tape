#!/usr/bin/env bash
# Local gate for the native Android app. Each step runs bare and the script stops at the first
# failure. The test floor starts at 1 and is raised to the real count, rounded down to a ten, at
# each merge point. It is never lowered.
set -e
cd "$(git rev-parse --show-toplevel)/android"
FLOOR=1
./gradlew --no-daemon -q :engine:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
python3 -I count-tests.py engine/build/test-results/test app/build/test-results/testDebugUnitTest --min "$FLOOR"
bash guard.sh
echo "ci-local(android): all checks passed"

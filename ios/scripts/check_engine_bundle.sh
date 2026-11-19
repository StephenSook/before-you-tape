#!/usr/bin/env bash
# The engine file the iPhone app carries must be exactly what the repository's bridge builds
# today: rebuild it with scripts/build-embed.sh into a temporary folder and compare byte for
# byte, and check the recorded SHA-256. Run from anywhere: bash ios/scripts/check_engine_bundle.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
res=ios/BYTCore/Sources/BYTCore/Resources
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
sh scripts/build-embed.sh "$tmp" > /dev/null
if ! cmp -s "$tmp/byt-engine.js" "$res/byt-engine.js"; then
  echo "check_engine_bundle: $res/byt-engine.js is stale; rebuild it with: sh scripts/build-embed.sh <dir>, then copy byt-engine.js"
  exit 1
fi
want=$(cut -d' ' -f1 "$res/byt-engine.sha256")
have=$(shasum -a 256 "$res/byt-engine.js" | cut -d' ' -f1)
if [ "$want" != "$have" ]; then echo "check_engine_bundle: byt-engine.sha256 does not match the file"; exit 1; fi
echo "check_engine_bundle: fresh ($(wc -c < "$res/byt-engine.js" | tr -d ' ') bytes, sha256 ${have:0:12})"

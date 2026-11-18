#!/bin/sh
# Bundles the rules engine bridge (src/embed/bridge.ts) into one script for native clients,
# and writes a manifest next to it.
#
#   sh scripts/build-embed.sh <outDir> [entry]
#
# Writes <outDir>/byt-engine.js (an IIFE that defines the global BYT; not minified, so it can be
# read inside the app), <outDir>/meta.json (esbuild's input list) and <outDir>/manifest.json:
# { bridgeVersion, sha256, bytes, esbuild, commit, dirty, inputs[] }.
# It calls the esbuild binary from node_modules directly, so it needs no node.
# Exit 2: esbuild is missing. Exit 1: the build failed, an input is outside src/engine,
# src/shared and src/embed, the bundle holds Firebase, DOM, WebCrypto, network or browser-storage
# code, or its size is outside 20,000 to 300,000 bytes.
set -eu

if [ "$#" -lt 1 ]; then
  echo "usage: sh scripts/build-embed.sh <outDir> [entry]" >&2
  exit 1
fi
out=$1
entry=${2:-src/embed/bridge.ts}
cd "$(dirname "$0")/.."

if [ -n "${BYT_ESBUILD:-}" ]; then
  esbuild=$BYT_ESBUILD
else
  esbuild=""
  count=0
  for candidate in node_modules/@esbuild/*/bin/esbuild; do
    if [ -x "$candidate" ]; then
      esbuild=$candidate
      count=$((count + 1))
    fi
  done
  if [ "$count" -gt 1 ]; then
    echo "build-embed: found $count esbuild binaries; set BYT_ESBUILD to one of them" >&2
    exit 2
  fi
fi
if [ -z "$esbuild" ] || [ ! -x "$esbuild" ]; then
  echo "build-embed: no esbuild binary; run npm ci at the repo root" >&2
  exit 2
fi

mkdir -p "$out"
if ! "$esbuild" "$entry" --bundle --format=iife --global-name=BYT --target=es2020 --charset=utf8 \
  --legal-comments=none --log-level=warning --metafile="$out/meta.json" --outfile="$out/byt-engine.js"; then
  echo "build-embed: esbuild failed" >&2
  exit 1
fi

python3 -I - "$out" "$("$esbuild" --version)" <<'PY'
import hashlib, json, pathlib, re, subprocess, sys

out = pathlib.Path(sys.argv[1])
version = sys.argv[2].strip()
bundle = (out / "byt-engine.js").read_bytes()
inputs = sorted(json.loads((out / "meta.json").read_text())["inputs"].keys())
problems = []
allowed = ("src/engine/", "src/shared/", "src/embed/")
for i in inputs:
    if not i.startswith(allowed):
        problems.append(f"input outside {', '.join(allowed)}: {i}")
banned = re.findall(
    rb"firebase|document\.|window\.|crypto\.subtle|fetch\(|XMLHttpRequest|WebSocket|EventSource|navigator\.|"
    rb"localStorage|sessionStorage|indexedDB|importScripts",
    bundle,
)
if banned:
    problems.append("the bundle holds " + ", ".join(sorted({b.decode() for b in banned})))
if not 20_000 <= len(bundle) <= 300_000:
    problems.append(f"bundle size {len(bundle)} bytes is outside 20,000 to 300,000")
bridge = pathlib.Path("src/embed/bridge.ts").read_text()
m = re.search(r"export const BRIDGE_VERSION = (\d+);", bridge)
if not m:
    problems.append("no BRIDGE_VERSION in src/embed/bridge.ts")
if problems:
    for p in problems:
        print(f"build-embed: {p}", file=sys.stderr)
    sys.exit(1)

def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True).stdout.strip()

manifest = {
    "bridgeVersion": int(m.group(1)),
    "sha256": hashlib.sha256(bundle).hexdigest(),
    "bytes": len(bundle),
    "esbuild": version,
    "commit": git("rev-parse", "HEAD"),
    "dirty": git("status", "--porcelain", "--", *inputs) != "",
    "inputs": inputs,
}
(out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"build-embed: {manifest['bytes']} bytes, sha256 {manifest['sha256'][:12]}, {len(inputs)} inputs")
PY

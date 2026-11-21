#!/usr/bin/env bash
# The airplane-mode check on a real iPhone (docs/evidence/ios/DEVICE-CHECKLIST.md), step by step:
#   bash ios/scripts/device-session.sh build     build the app for the phone (Release, signed)
#   bash ios/scripts/device-session.sh install   install it on the phone and open it once
#   bash ios/scripts/device-session.sh pull      copy the saved box off the phone, then summarize it
#   bash ios/scripts/device-session.sh summary <folder>   print each item's route and read time
# The phone is the one connected iPhone that devicectl lists as physical, or $BYT_DEVICE.
# Signing prompts, Apple ID and the phone's own settings are the phone owner's to answer.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

BUNDLE=app.beforeyoutape.reader
DD="${BYT_DEVICE_DD:-$HOME/Library/Caches/byt-device-dd}"
APP="$DD/Build/Products/Release-iphoneos/BYT.app"

device() {
  if [ -n "${BYT_DEVICE:-}" ]; then echo "$BYT_DEVICE"; return; fi
  local list ids
  list="$(mktemp)"
  xcrun devicectl list devices > "$list"
  # A device's name can hold spaces, so the UDID is found by its own pattern.
  ids="$(python3 -I -c "
import re, sys
rows = [l for l in open(sys.argv[1]) if re.search(r'\sconnected\s', l) and 'physical' in l]
print('\n'.join(m.group(1) for l in rows for m in [re.search(r'([0-9A-Fa-f-]{20,}) \(UDID\)', l)] if m))
" "$list")"
  rm -f "$list"
  if [ -z "$ids" ] || [ "$(printf '%s\n' "$ids" | wc -l | tr -d ' ')" != "1" ]; then
    echo "Expected one connected physical iPhone; found: ${ids:-none}. Set BYT_DEVICE to its UDID." >&2
    exit 1
  fi
  echo "$ids"
}

case "${1:-}" in
  build)
    settings=ios/BYT/Config/GoogleService-Info.plist
    [ -s "$settings" ] || { echo "$settings is missing (it is gitignored)." >&2; exit 1; }
    udid="$(device)"
    echo "commit $(git rev-parse HEAD)$(git diff --quiet HEAD -- ios || echo ' (with uncommitted ios changes)')"
    echo "device $udid"
    xcodegen generate --spec ios/project.yml --quiet
    xcodebuild -quiet -project ios/BYT.xcodeproj -scheme BYT -configuration Release -destination "id=$udid" \
      -derivedDataPath "$DD" -allowProvisioningUpdates build
    test -d "$APP"
    echo "built $APP"
    ;;
  install)
    udid="$(device)"
    test -d "$APP" || { echo "Build first: bash ios/scripts/device-session.sh build" >&2; exit 1; }
    xcrun devicectl device install app --device "$udid" "$APP"
    xcrun devicectl device process launch --device "$udid" --terminate-existing "$BUNDLE"
    ;;
  pull)
    udid="$(device)"
    out="docs/evidence/ios/$(date +%Y-%m-%d)-device"
    mkdir -p "$out"
    xcrun devicectl device copy from --device "$udid" --domain-type appDataContainer --domain-identifier "$BUNDLE" \
      --source "Library/Application Support/boxes" --destination "$out/boxes"
    xcrun devicectl device info details --device "$udid" > "$out/device.txt"
    git rev-parse HEAD > "$out/commit.txt"
    bash "$0" summary "$out"
    ;;
  summary)
    folder="${2:?usage: device-session.sh summary <folder>}"
    python3 -I - "$folder" <<'PY'
import json, pathlib, sys
files = sorted(pathlib.Path(sys.argv[1]).rglob("*.json"))
files = [f for f in files if ".unreadable-" not in f.name]
if not files:
    sys.exit("No saved box found in " + sys.argv[1])
rows = 0
for f in files:
    box = json.loads(f.read_text())
    print(f"box {box.get('boxId')} ({f.name}), country {box.get('destinationCode')}, sources {box.get('sources')}")
    for n, item in enumerate(box.get("items", []), start=1):
        read = item.get("read", {})
        print(f"  {n}. {read.get('itemName')!r} [{read.get('category')}] route={item.get('readSource')} "
              f"read_ms={round(item.get('readMs', 0))}")
        rows += 1
on_device = sum(1 for f in files for i in json.loads(f.read_text()).get("items", []) if i.get("readSource") == "phone_on_device")
print(f"{rows} items, {on_device} read on the phone")
PY
    ;;
  *)
    echo "usage: bash ios/scripts/device-session.sh build|install|pull|summary <folder>" >&2
    exit 2
    ;;
esac

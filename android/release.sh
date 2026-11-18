#!/usr/bin/env bash
# Builds the release-signed APK. The keystore path is in the untracked local.properties
# (byt.release.storeFile, default ~/.byt-keys/byt-android-release.jks); the password comes from the
# macOS Keychain (service byt-android-release) into this process only, and the build runs without
# the configuration cache so the password is never written to a cache. Then it checks the exact
# signed file: its certificate, no App Check debug secrets, and 16 KB page alignment.
set -euo pipefail
cd "$(dirname "$0")"
service="${BYT_RELEASE_KEYCHAIN_SERVICE:-byt-android-release}"
BYT_RELEASE_PASSWORD="$(security find-generic-password -w -s "$service")"
export BYT_RELEASE_PASSWORD
./gradlew --no-configuration-cache assembleRelease
unset BYT_RELEASE_PASSWORD
apk=app/build/outputs/apk/release/app-release.apk
tools="${ANDROID_HOME:-$HOME/Library/Android/sdk}/build-tools/37.0.0"
"$tools/apksigner" verify --print-certs "$apk"
# The public APK is this release build, never a debug build, which carries its App Check debug
# token in its resources. Scan the exact signed file.
./scan-apk.sh "$apk"
# The QuickJS native libraries must be aligned for 16 KB memory pages.
set +e
"$tools/zipalign" -c -P 16 -v 4 "$apk" > /dev/null
align=$?
set -e
echo "zipalign 16 KB check exit: $align"
[ "$align" -eq 0 ]
echo "release APK: $apk"

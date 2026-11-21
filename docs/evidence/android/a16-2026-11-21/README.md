# Before You Tape judge build on a real phone, 2026-11-21

The release APK attached to the `android-judge` release (`before-you-tape-android-76acd04.apk`, SHA-256
`df64d580a71f9cd01ea9efc95df0542d4286a94ff8dc39494cf012f840ab4f71`), built from main at 76acd04 with
`android/release.sh`, on a Samsung A16 (SM-A166U, Android 16). No screenshots were taken this time.

- **The file:** `release.sh` passed. The signing certificate is SHA-256 `7d672af6...6ada`, `scan-apk.sh` found 0
  hits in 679 entries, the Firebase configuration is present, the 16 KB alignment check exited 0, and versionCode
  1795222628 is the HEAD commit time. By aapt2, it asks for INTERNET, CAMERA, ACCESS_NETWORK_STATE, the AICore
  service binding and the Google services read, and for no location, microphone or contacts permission.
- **The install:** `adb install -r` over the earlier build (versionCode 1, installed 2026-11-18). The installed
  `base.apk` has the SHA-256 above.
- **The release gate:** this is the `RELEASE.md` command, with
  `-Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true` so the app stayed installed.
  `ReleaseAppCheckProbeTest` passed at 2026-11-21T01:17:22Z: App Check used Play Integrity (a 1037-character
  token), sign-in worked, and the app's reader returned the known label as a `power_bank` (outcome Read, source
  `IN_CLOUD`, route `CLOUD_ONLY`). 1 test, 0 failures. The test package was removed afterwards.
  Found later the same day: the Gradle run installs its own build of the commit over the attached file (see the
  `android-judge-2` section below, where that build had a different SHA-256). So this run most likely probed a
  Gradle build of 76acd04, not the attached file's own bytes.
- **In the app:** at 2026-11-21T01:28:50Z, one typed item was added to the box to Canada, then removed. The camera
  prompt was dismissed with Back, so the camera was not allowed and never opened.
- **No on-device read:** `pm list packages com.google.android.aicore` returns nothing on this phone, so no
  on-device model can run here.

## The `android-judge-2` build, 2026-11-21

The release APK attached to the `android-judge-2` draft release (`before-you-tape-android-59c5914.apk`, SHA-256
`8b9f332dc7f681caf8a9d23a8b57e8ce8310b50b1e66edfa6407f88a5e3cade9`), built from main at 59c5914 with
`android/release.sh`, on the same Samsung A16 (SM-A166U, Android 16).

- **The install:** `adb install -r` over the `android-judge` build (versionCode 1795222628). The installed `base.apk`
  had the SHA-256 above, versionCode 1795234079.
- **The release gate:** the `RELEASE.md` command, run from a checkout of 59c5914 with
  `-Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true`, passed at 2026-11-21T17:36:20Z (1 test,
  0 failures). Afterwards the installed `base.apk` had SHA-256 `fcc571fb791865533481b4c2066d77dd70710e14a6d855f27a8e2aa34e364416`:
  Gradle had installed its own build of 59c5914 (same versionCode) over the attached file.
- **The probe on the attached file itself:** the attached APK was installed again with `adb install -r` (SHA-256
  checked: `8b9f332d...3cade9`), and `ReleaseAppCheckProbeTest` was run with `am instrument` against it. It passed
  at 2026-11-21T17:36:50Z: App Check used Play Integrity (a 1037-character token), sign-in worked, and the app's
  reader returned the known label as a `power_bank` (outcome Read, source `IN_CLOUD`, route `CLOUD_ONLY`).
  1 test, 0 failures. The installed file still had the attached file's SHA-256 afterwards.
- **The rules on the phone:** gate G-A5 ran on the same attached file right after (`G-A5.md`): every shared vector
  passed and QuickJS matched WebView V8 on all 427 inputs.

## Firestore with App Check enforced, 2026-11-21

Firestore App Check enforcement was turned on at 2026-11-21T17:33:58Z. After 15 minutes for it to spread, the two
live tests that use production Firestore ran from main at ac509e2, on both App Check paths.

- **Play Integrity, on the A16:** a release build (`-Pbyt.testBuildType=release`), so the release provider. At
  2026-11-21T17:50:02Z, 2 tests, 0 failures. `BoxLiveTest`: a box made on the phone (with `expiresAt`) was accepted,
  an item written offline reached the server and a server read returned it with no label text, the destination change
  was accepted, and a stranger was refused the box (`PERMISSION_DENIED`). `EditionPinLiveTest`: the server read of an
  edition that is not published was allowed and found nothing, and the app kept its built-in edition (revision 3).
- **The registered debug token, on the `byt_aosp` emulator:** a debug build, so the debug provider. At
  2026-11-21T17:51:23Z, 2 tests, 0 failures, with the same results.
- **Afterwards:** the Gradle run removed the app and the test package from the A16. The `android-judge-2` APK was
  installed again (SHA-256 `8b9f332d...3cade9`, versionCode 1795234079).

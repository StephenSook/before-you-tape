# The `android-judge-6` build on a Samsung A16, 2026-11-23

The release APK for the `android-judge-6` release, `before-you-tape-android-1d5e13c.apk` (SHA-256
`795253ba7bbea983b7ae1c887be28014039b850ce57031424a7642bfc6d173d1`, 27,501,597 bytes), on a Samsung A16 (SM-A166U),
Android 16 (API 36). It was built from main at 1d5e13c with `android/release.sh`, and carries rule edition
`byt-56273cd51d25` (revision 7) built in, the same edition as `android-judge-5`. New in it: each AI Logic call sends
one Firebase Performance Monitoring trace, `ai_read`. All times are UTC.

- **Before:** the `android-judge-5` file was installed (SHA-256 `4d58a905...24f9`, versionCode 1795362266), with no
  test package, and the phone showed a Settings screen.
- **The file:** `release.sh` passed: the release certificate (`7d672af6...6ada`), `scan-apk.sh` found 0 hits in 678
  entries, the Firebase configuration was present, the 16 KB alignment check exited 0, and versionCode 1795467789 is
  the HEAD commit time. By aapt2 it asks for the camera and network, the AICore binding and the Google services read,
  and for no location, microphone or contacts permission. Its manifest has no
  `firebase_performance_collection_deactivated` key and carries the Performance Monitoring and Firebase Sessions
  providers, so Performance Monitoring is on in this file.
- **The `RELEASE.md` Gradle command:** run from 1d5e13c itself, with the test APKs left installed, it passed at
  22:48 (1 test, `ReleaseAppCheckProbeTest`). The attached file then installed over its build with `adb install -r`,
  without an uninstall; the app's data was kept.
- **The release gate, on the attached file:** the installed `base.apk` had the attached file's SHA-256 at 22:48:42.
  `ReleaseAppCheckProbeTest`, run with `am instrument` from 22:48:43 to 22:48:51, passed: App Check used Play
  Integrity (a 1037-character token), sign-in worked, and the app's reader returned a drawn power bank label as a
  `power_bank` (outcome Read, source `IN_CLOUD`, route `CLOUD_ONLY`). The SHA-256 was the same after. The probe builds
  its own reader with no trace sink, so it sent no `ai_read` trace.
- **The rules on the phone, on the attached file:** `DeviceVectorsTest` and `EngineDifferentialTest` passed 4 of 4 by
  22:49:09: box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 157.0.8103.50 on 481 inputs (312
  labels), bundle `fdebfc6d36ce`.
- **About this phone:** read from the phone's UI tree at 22:49:45, it showed "App Check provider: Play Integrity",
  "Rules edition: byt-56273cd51d25", "Rules bundle: 34bb0e2 (fdebfc6d36ce)", "Cloud reads: not chosen yet" and "This
  phone has no on-device model". The cloud question was left unanswered.
- **Afterwards:** the test package was removed. The installed file is the attached file (SHA-256 checked at
  22:50:20), and the phone was back on the Settings screen it showed before.

The same file on an Android 17 emulator (`byt_aosp`), installed with adb and its SHA-256 checked, passed the same 4
rule tests by 22:50:42: box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 145.0.7632.218 on 481
inputs. The emulator was shut down afterwards. On this commit's tree the app's unit and rules engine tests (242)
passed in `android/ci-local.sh`.

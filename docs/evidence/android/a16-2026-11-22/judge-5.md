# The `android-judge-5` build on a Samsung A16, 2026-11-22

The release APK for the `android-judge-5` release, `before-you-tape-android-27087ac.apk` (SHA-256
`4d58a905dd0dfe6d771fa31bd7ea4b111e754b83d08977a12139166d73e924f9`), on a Samsung A16 (SM-A166U), Android 16 (API 36).
It was built from main at 27087ac with `android/release.sh`, and carries rule edition `byt-56273cd51d25` (revision 7)
built in, the same edition as `android-judge-4`. All times are UTC.

- **Before:** the `android-judge-4` file was installed (SHA-256 `fe218b21...ca73`, versionCode 1795318667), with no
  test package.
- **The file:** `release.sh` passed: the release certificate (`7d672af6...6ada`), `scan-apk.sh` found 0 hits in 679
  entries, the Firebase configuration was present, the 16 KB alignment check exited 0, and versionCode 1795362266 is
  the HEAD commit time. By aapt2 it asks for the camera and network, the AICore binding and the Google services read,
  and for no location, microphone or contacts permission.
- **The `RELEASE.md` Gradle command:** run from 27087ac itself, with the test APKs left installed, it passed at
  18:55:45Z (1 test, `ReleaseAppCheckProbeTest`). Its own build has the same versionCode as the attached file, so the
  attached file then installed over it with `adb install -r`, without an uninstall; the app's data was kept.
- **The release gate, on the attached file:** `ReleaseAppCheckProbeTest`, run with `am instrument` at 18:56:06Z to
  18:56:09Z, passed: App Check used Play Integrity (a 1037-character token), sign-in worked, and the app's reader
  returned a drawn power bank label as a `power_bank` (outcome Read, source `IN_CLOUD`, route `CLOUD_ONLY`). The
  installed `base.apk` had the attached file's SHA-256 before and after.
- **The rules on the phone, on the attached file:** `DeviceVectorsTest` and `EngineDifferentialTest` passed 4 of 4 at
  18:56:15Z: box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 157.0.8103.50 on 481 inputs (312
  labels), bundle `fdebfc6d36ce`.
- **About this phone:** read from the phone's UI tree after 18:56:16Z, it showed "App Check provider: Play Integrity",
  "Rules edition: byt-56273cd51d25" and "Rules bundle: 34bb0e2 (fdebfc6d36ce)". The home screen showed no notice. The
  cloud question was left unanswered.
- **Afterwards:** the test package was removed. The installed file is the attached file (SHA-256 checked).

The same file on an Android 17 emulator (`byt_aosp`), installed with adb, passed the same 4 rule tests at 18:54:46Z:
box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 145.0.7632.218 on 481 inputs. On this commit the
unit tests (195), engine tests (33) and device tests (49, on the emulator with a debug build) passed.

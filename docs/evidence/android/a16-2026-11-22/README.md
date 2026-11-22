# The `android-judge-4` build on a Samsung A16, 2026-11-22

The release APK for the `android-judge-4` release, `before-you-tape-android-3708cf1.apk` (SHA-256
`fe218b21323179b904bd0b3765cd38af0f5426f194b7b4857458f6ec235dca73`), on a Samsung A16 (SM-A166U), Android 16 (API 36).
It was built from main at 3708cf1 with `android/release.sh`, and carries rule edition `byt-56273cd51d25` (revision 7)
built in. Remote Config pins revision 6. All times are UTC.

- **Before:** the `android-judge-3` file was installed (SHA-256 `89c36ece...26bc`). At 04:21:32Z its About screen read
  "Rules edition: byt-08f3b8c7ff31" (revision 6, through the pin) and "Rules bundle: cf36a8d (7eec63d00561)". The home
  screen showed no notice. The screens were read from the phone's UI tree; the cloud question was left unanswered.
- **The file:** `release.sh` passed: the release certificate (`7d672af6...6ada`), `scan-apk.sh` found 0 hits in 679
  entries, the Firebase configuration was present, the 16 KB alignment check exited 0, and versionCode 1795318667 is
  the HEAD commit time. By aapt2 it asks for the camera and network, the AICore binding and the Google services read,
  and for no location, microphone or contacts permission.
- **The install:** `adb install -r` over the `android-judge-3` build. The installed `base.apk` had the SHA-256 above.
- **The release gate, on the attached file:** `ReleaseAppCheckProbeTest`, run with `am instrument` from 04:22:34Z to
  04:22:40Z, passed: App Check used Play Integrity (a 1037-character token), sign-in worked, and the app's reader
  returned a drawn power bank label as a `power_bank` (outcome Read, source `IN_CLOUD`, route `CLOUD_ONLY`). The
  installed file had the attached file's SHA-256 before and after.
- **The rules on the phone, on the attached file:** `DeviceVectorsTest` and `EngineDifferentialTest` passed 4 of 4 at
  04:22:51Z: box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 157.0.8103.50 on 481 inputs (312
  labels), bundle `fdebfc6d36ce`.
- **The `RELEASE.md` Gradle command:** passed at 04:24:59Z (1 test). It ran from 187e300, which changes nothing under
  `android/`, `rules/`, `tests/vectors/`, `src/engine/` or `src/embed/` since 3708cf1. Its own build had a newer
  versionCode (1795320260, that commit's time), so Android refused the attached file over it as a downgrade. The app was
  uninstalled, which cleared its data on this test phone, and the attached file was installed again (SHA-256 checked).
- **The rule edition with the pin at revision 6:** at 04:26:40Z the About screen of the attached file read "Rules
  edition: byt-56273cd51d25" and "Rules bundle: 34bb0e2 (fdebfc6d36ce)": the built-in revision 7 is kept, and the
  home screen showed no notice.
- **Afterwards:** the test package was removed. The installed file is the attached file (SHA-256 checked).

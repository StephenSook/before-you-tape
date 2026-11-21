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
- **In the app:** at 2026-11-21T01:28:50Z, one typed item was added to the box to Canada, then removed. The camera
  prompt was dismissed with Back, so the camera was not allowed and never opened.
- **No on-device read:** `pm list packages com.google.android.aicore` returns nothing on this phone, so no
  on-device model can run here.

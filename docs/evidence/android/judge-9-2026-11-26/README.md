# The `android-judge-9` build, 2026-11-26

The release APK for `android-judge-9`, `before-you-tape-android-3250df7.apk` (SHA-256
`1324d4a0f4b745c739b8b416228ec9c928d74c25f88f28f16681bfb8f54458ca`, 27,501,577 bytes, versionCode 1795658567). It
was built from main at 3250df7 with `android/release.sh`. That checked the exact signed file:
- the signing certificate is SHA-256 `7d672af6...6ada`;
- `scan-apk.sh` found 0 debug tokens in 678 entries;
- the Firebase configuration is present;
- the 16 KB alignment check passed.

It carries rule edition `byt-d098b14aa534` (revision 9) built in, with rules bundle `fdebfc6d36ce`, the same engine
as `android-judge-8`. Revision 9 drops the suspension of mail to Canada from 2026-11-29 that revision 8 listed. It
was misread from an inactive banner on the USPS service alerts page, so this build has no Canada notice and no
change for Canada on 2026-11-29. Between d39d8ad (`android-judge-8`) and 3250df7, nothing changed in
`android/app/src/main`. The changes in `rules/` are revision 9 and `rules/live-engines.json`. All times are UTC.

## On a Samsung A16, the release gate

The phone: Samsung A16 (SM-A166U, `a16x`), Android 16 (API 36), with no on-device model.

- **The `RELEASE.md` Gradle command:** it ran from 3250df7 with `ANDROID_SERIAL` set to this phone and the test
  APKs left installed. It passed at 02:13:51 (1 test, `ReleaseAppCheckProbeTest`, 0 failures). The attached file
  was then installed over that build with `adb install -r`.
- **The release gate, on the attached file:** the installed `base.apk` had the attached file's SHA-256 at
  02:14:09. `ReleaseAppCheckProbeTest`, run with `am instrument` from 02:14:09 to 02:14:15, passed (OK, 1 test).
  The SHA-256 was the same after.
- **The rules on the phone, on the attached file:** `DeviceVectorsTest` and `EngineDifferentialTest` passed 4 of 4
  from 02:14:36 to 02:14:41. QuickJS gave the same output as WebView V8 157.0.8103.50 on 481 inputs (312 labels),
  with bundle `fdebfc6d36ce` (the phone's log line `BYT-PARITY: ... inputs=481 labels=312 equal`).
- **About this phone:** read from the phone's UI tree at 02:15:06. It showed:
  - "App Check provider: Play Integrity";
  - "Rules edition: byt-d098b14aa534";
  - "Rules bundle: 3250df7 (fdebfc6d36ce)";
  - "This phone has no on-device model".
- **After:** the test package was uninstalled, and the installed `base.apk` still had the attached file's
  SHA-256. What was installed before the check was not recorded.

## On a Pixel 10, with the phone's own model and in the cloud

The phone: Pixel 10 (`frankel`), Android 17 (build CP3A.261005.005).

- **Before:** the `android-judge-8` file was installed at 02:16:34 (`base.apk` SHA-256 `72890037...2ad6`,
  versionCode 1795609134), with no test package.
- **The `RELEASE.md` Gradle command:** it passed at 02:16:54 (1 test, 0 failures). The attached file was then
  installed with `adb install -r`. At 02:17:12 the installed `base.apk` had its SHA-256 (`1324d4a0...58ca`).
- **The release gate, on the attached file:** `ReleaseAppCheckProbeTest` passed at 02:17:12 (OK, 1 test):
  - App Check used Play Integrity (a 1037-character token);
  - sign-in worked;
  - the app's reader returned a drawn power bank label as a `power_bank` (outcome Read, source `IN_CLOUD`, route
    `CLOUD_ONLY`).
- **The rules on the phone:** `DeviceVectorsTest` and `EngineDifferentialTest` passed 4 of 4 from 02:17:21 to
  02:17:36: box 80, guards 64, destinations 25. QuickJS gave the same output as WebView V8 149.0.7827.5 on 481
  inputs (312 labels), with bundle `fdebfc6d36ce`.
- **The published power bank photo, read twice through the app's own client:** an instrumentation test, kept out of
  the repo, did the reads. It opened the app's main screen first, because AICore reads on the phone only for an
  app in the foreground. Its first run, at 02:17:19, without that screen, stopped with AICore's
  "[ErrorCode 30] Background usage is blocked". The test read `public/eval/items/own-01.jpg` (1200 x 1600, the
  whole photo, no crop) with the app's prompt, once with `ONLY_ON_DEVICE` and once with `ONLY_IN_CLOUD`, network on,
  from 02:18:34 to 02:18:50:
  - The on-device model's status was `AVAILABLE`.
  - **On the phone:** source `ON_DEVICE`, 9,356 ms: `power_bank`, 3.7 V, 5,000 mAh and 18,500 Wh, evidence
    `label_read`. The label prints 50,000 mAh and 185 Wh, so the phone's model misread both numbers.
  - **In the cloud:** source `IN_CLOUD`, 4,112 ms: `power_bank`, 3.7 V, 50,000 mAh and 185 Wh, evidence
    `label_read`, which match the label.
  - The test called the client directly, not through the app's camera screen or its cloud setting. The rules were
    not run on these two reads. Android has no cloud second look, so this is a cloud read of the same photo, not a
    second look.
- **About this phone:** read from the phone's UI tree at 02:19:19. It showed:
  - "App Check provider: Play Integrity";
  - "Cloud reads: off" (the app's own setting on this phone, unchanged);
  - "Rules edition: byt-d098b14aa534";
  - "Rules bundle: 3250df7 (fdebfc6d36ce)".
- **After:** the test package was uninstalled (the package list no longer shows it), and at 02:19:19 the installed
  `base.apk` still had the attached file's SHA-256.

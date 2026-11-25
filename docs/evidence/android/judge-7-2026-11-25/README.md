# The `android-judge-7` build, 2026-11-25

The release APK for the `android-judge-7` release, `before-you-tape-android-7170418.apk` (SHA-256
`f711035d7f72c2b48ee091851b2a9251b65a26f9521cdad03652620353795f72`, 27,501,597 bytes, versionCode 1795577723). It
was built from main at 7170418 with `android/release.sh` and carries rule edition `byt-56273cd51d25` (revision 7)
built in, the same edition as `android-judge-6`. New in it: a read on the phone's own model works. In
`android-judge-6`, every on-device read stopped before the model ran, because three fields of the read's schema were
enums, a type ML Kit's on-device structured output does not accept. All times are UTC.

## On a Pixel 10, with the phone's own model

The phone: Pixel 10 (`frankel`), Android 17 (build CP3A.261005.005), AICore 26.10.15.11, base model `nano-v4-full`.
The app's choice was "Check on this phone only", so cloud reads were off.

- **Before, on `android-judge-6`:** About this phone showed "On-device model: ready" at 03:16:39. Three reads of
  a photo at 03:19:30 to 03:19:42 each showed "This phone's model could not read it.", and AICore recorded no call
  from the app.
- **The file:** `android-judge-7` was installed with adb, with its SHA-256 checked on the phone.
- **A read with the camera:** at 03:51:37 the app's card for a photo of an isopropyl alcohol spray read "Isopropyl
  Alcohol Spray", "Take it out", "Flammable liquids can't go by international mail. That includes nail polish,
  hand sanitizer, and perfume or other liquids with alcohol." and "Read on this phone in 9.3 s.", with the
  destination the Philippines ([`pixel10-read-on-device.png`](pixel10-read-on-device.png)).
- **A diagnostic test inside the app, kept out of the repo:** with a drawn power bank label and no cloud call, the
  model's status was `AVAILABLE`; plain text and a photo plus text ran on the device (366 ms and 1,387 ms); the
  app's own read (`generateObject` with the `LabelRead` schema, `ONLY_ON_DEVICE`) returned a power bank of 18.5 Wh
  from the device in 4,001 ms; its reply text was empty while its typed object was set; and the app's reader on the
  phone-only route, with the web app's parser, accepted the read (source `ON_DEVICE`, route `DEVICE_ONLY`)
  ([`pixel10-probe.txt`](pixel10-probe.txt)). The test package was removed afterwards, and the app's SHA-256 was
  the same.

## On a Samsung A16, the release gate

The phone: Samsung A16 (SM-A166U), Android 16 (API 36), with no on-device model.

- **Before:** the `android-judge-6` file was installed (SHA-256 `795253ba...73d1`, versionCode 1795467789), with no
  test package, and the phone showed a Settings screen (03:48:44).
- **The file:** `release.sh` passed: the release certificate (`7d672af6...6ada`), `scan-apk.sh` found 0 hits in 678
  entries, the Firebase configuration was present, the 16 KB alignment check exited 0, and versionCode 1795577723 is
  the HEAD commit time. By aapt2 it asks for the camera and network, the AICore binding and the Google services read,
  and for no location, microphone or contacts permission. Its manifest has no
  `firebase_performance_collection_deactivated` key and carries the Performance Monitoring and Firebase Sessions
  providers. In its dex, `LabelRead_MlKitCompanion.category` is a `String`; in `android-judge-6` it was the
  `ItemCategoryWire` enum.
- **The `RELEASE.md` Gradle command:** run from 7170418 itself, with the test APKs left installed, it passed at
  03:49:13 (1 test, `ReleaseAppCheckProbeTest`). The attached file then installed over its build with `adb install
  -r`; the app's data was kept.
- **The release gate, on the attached file:** the installed `base.apk` had the attached file's SHA-256 at 03:49:35.
  `ReleaseAppCheckProbeTest`, run with `am instrument` from 03:49:36 to 03:49:40, passed: App Check used Play
  Integrity (a 1037-character token), sign-in worked, and the app's reader returned a drawn power bank label as a
  `power_bank` (outcome Read, source `IN_CLOUD`, route `CLOUD_ONLY`). So the cloud path reads the new string fields.
  The SHA-256 was the same after.
- **The rules on the phone, on the attached file:** `DeviceVectorsTest` and `EngineDifferentialTest` passed 4 of 4 by
  03:49:52: box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 157.0.8103.50 on 481 inputs (312
  labels), bundle `fdebfc6d36ce`.
- **About this phone:** read from the phone's UI tree at 03:50:19, it showed "App Check provider: Play Integrity",
  "Rules edition: byt-56273cd51d25", "Rules bundle: 34bb0e2 (fdebfc6d36ce)", "Cloud reads: allowed" (chosen on this
  phone before this check) and "This phone has no on-device model". Nothing was changed.
- **Afterwards:** the test package was removed. The installed file is the attached file (SHA-256 checked at
  03:50:47), and the phone was back on the Settings screen it showed before.

## On an emulator

The same file on an Android 17 emulator (`byt_aosp`), installed with adb and its SHA-256 checked, passed the same 4
rule tests by 03:51:20: box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 145.0.7632.218 on 481
inputs. The emulator was shut down afterwards. On this commit's tree the app's unit and rules engine tests (245)
passed in `android/ci-local.sh`.

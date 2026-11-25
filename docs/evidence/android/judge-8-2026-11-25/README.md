# The `android-judge-8` build, 2026-11-25

The release APK for the `android-judge-8` release, `before-you-tape-android-d39d8ad.apk` (SHA-256
`72890037c2ca9059454e72d5615fc55c47a7e45b3c029b4326f3696a1bda2ad6`, 27,501,597 bytes, versionCode 1795609134). It
was built from main at d39d8ad with `android/release.sh` and carries rule edition `byt-f083f028e045` (revision 8)
built in. Revision 8 records the USPS international service alerts page read again on 2026-11-25. Between 7170418
(`android-judge-7`) and d39d8ad, the only changes outside tests in `android/`, `src/engine`, `src/ai` and `rules/`
are rules data and `android/CHANGELOG.md`. All times are UTC.

## On a Samsung A16, the release gate

The phone: Samsung A16 (SM-A166U, `a16x`), Android 16 (API 36), with no on-device model.

- **Before:** the `android-judge-7` file was installed (`base.apk` SHA-256 `f711035d...5f72`, versionCode
  1795577723), with no test package, at 16:18:47.
- **The `RELEASE.md` Gradle command:** run from d39d8ad itself, with `ANDROID_SERIAL` set to this phone and the
  test APKs left installed, it passed at 16:19:23 (1 test, `ReleaseAppCheckProbeTest`, 0 failures). The attached
  file then installed over its build with `adb install -r`; the app's data was kept.
- **The release gate, on the attached file:** the installed `base.apk` had the attached file's SHA-256 at 16:19:44.
  `ReleaseAppCheckProbeTest`, run with `am instrument` from 16:19:44 to 16:19:49, passed: App Check used Play
  Integrity (a 1037-character token), sign-in worked, and the app's reader returned a drawn power bank label as a
  `power_bank` (outcome Read, source `IN_CLOUD`, route `CLOUD_ONLY`) ([`a16-probe-logcat.txt`](a16-probe-logcat.txt);
  the first three lines are the Gradle run, the last three the attached file; the phone's clock is UTC-5). The
  SHA-256 was the same after.
- **The rules on the phone, on the attached file:** `DeviceVectorsTest` and `EngineDifferentialTest` passed 4 of 4
  from 16:20:08 to 16:20:14: box 80, guards 64, destinations 25, and QuickJS equal to WebView V8 157.0.8103.50 on
  481 inputs (312 labels), bundle `fdebfc6d36ce` ([`a16-parity-logcat.txt`](a16-parity-logcat.txt)).
- **About this phone:** read from the phone's UI tree at 16:20:45, it showed "App Check provider: Play Integrity",
  "Cloud reads: allowed" (chosen on this phone before this check), "Rules edition: byt-f083f028e045", "Rules
  bundle: d39d8ad (fdebfc6d36ce)" and "This phone has no on-device model". Nothing was changed.
- **After:** the test package was uninstalled (the package list no longer shows it), and at 16:20:53 the
  installed `base.apk` still had the attached file's SHA-256.

## On a Pixel 10, with the phone's own model

The phone: Pixel 10 (`frankel`), Android 17 (build CP3A.261005.005).

- **The file:** before, the `android-judge-7` file was installed (`base.apk` SHA-256 `f711035d...5f72`). The
  attached file was installed with `adb install -r`; the installed `base.apk` then had its SHA-256
  (`72890037...2ad6`), and the same after the run.
- **Our 40 eval photos, read on the phone:** a diagnostic test inside the app, kept out of the repo, read each
  photo of the frozen eval set once through the app's own read on the phone-only route, with no cloud call, from
  16:11:59 to 16:14:13. It reported rule edition `byt-f083f028e045` and the on-device model's status as
  `AVAILABLE`, and the app's engine judged each read for Canada and the Philippines on 2026-11-25. The test package
  was removed afterwards.
  - 26 of 40 photos were read on the phone (source `ON_DEVICE`), with a median of 4,450.5 ms (the mean of the two
    middle reads, 4,231 and 4,670 ms).
  - 14 were not read, and gave no verdict. 13 stopped in about 210 to 280 ms with AICore's error "[ErrorCode 9]
    Request cannot be processed. Either your app is out of usage quota (try again later) or ...". These started
    at the 26th read in a row, with 2 reads still going through between them, so a full run needs pauses between
    reads. 1 stopped with "[ErrorCode 4] Request doesn't pass certain policy check."
  - Of the 52 verdicts (2 for each read photo), 45 equal our draft labels (see `eval/runs/README.md` for where the
    labels come from) and 7 are milder. 6 of those 7 say "Check this" where the label says "Take it out".
  - 1 says "OK to pack" for Canada where the label says "Take it out": own-23, a perfume that the phone's model
    read as `makeup`. The rules ask whether the label lists alcohol for perfume, liquid toiletries and medicine,
    or when the label's words name a fragrance or alcohol, but not for makeup alone, so no question was asked. Its label rests on the owner's word that it contains alcohol;
    the photo does not show the ingredient line. On 2026-11-21 the web app's run read the same photo on the device
    as `perfume_fragrance`, asked the alcohol question, and showed "Check this" for Canada. From 2026-11-29 every
    item for Canada reads "Check this" or above, because of the announced suspension.
  - So on this phone, 1 of the 24 hazard items it read was called "OK to pack" (the exact one-sided 95% upper
    bound is 18.3%). 4 hazard items were not read. This is a different measurement from the web app's controlled
    run in `eval/runs/README.md` (0 of 28 on 2026-11-21, Chrome's built-in model on a laptop, with a second look
    in the cloud), and the Android app runs no second look.
- **The same 40 photos again, paced:** the same test, with a 15 s pause before each read after the first and up to
  3 tries again after AICore's usage quota error (a 60 s wait, doubling), from 17:04:28 to 17:18:05. The test also
  recorded each read's liquid, glass, powder, alcohol and flammable flags. The installed `base.apk` had the
  attached file's SHA-256 before and after, and the test package was removed.
  - 39 of 40 photos were read on the phone, with a median of 5,413 ms. No read hit the quota error, so none was
    tried again. 1 photo, i09, stopped with AICore's policy check, as in the first run.
  - Of the 78 verdicts, 54 equal our draft labels, 7 are milder and 17 are stricter. The 7 milder ones are the
    same 7 as in the first run. The 17 stricter ones are on items labelled "OK to pack": 16 say "Check this" and
    1 says "Take it out". 15 of the 17 are on photos the phone read as an item seen, with no label read
    (`item_seen`).
  - own-23 was again read as `makeup`, with `liquid` true, `glass` false and no alcohol or flammable words. It got
    "OK to pack" for Canada and "Take it out" for the Philippines (PH-P-01, a liquid). A makeup read with no
    alcohol, fragrance or flammable words is "Take it out" for the Philippines when it is liquid or glass; this
    read was liquid.
  - So in this run, 1 of the 27 hazard items it read was called "OK to pack", the same item (the exact one-sided
    95% upper bound is 16.4%). 1 hazard item was not read.

## What a failed read on the phone shows

Both AICore errors above reach the app as `FirebaseAIOnDeviceUnknownException`, which
`android/.../ai/AiMapping.kt` maps to a device failure. When cloud reads are allowed, the app's reader retries a
device failure once in the cloud (`android/.../ai/ItemReader.kt`). On the phone-only route, the app shows "This
phone's model could not read it." with no verdict, and the person can try again or type the item.

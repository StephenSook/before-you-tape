# Gate G-A5: the rules give the same answers on the phone

The Android app runs the web app's own rules bundle (`byt-engine.js`) in QuickJS. This gate checks
two things on a real Android runtime:

1. Every shared vector (`tests/vectors`) gives its expected verdict inside the app's runtime.
2. QuickJS and a second, independent JavaScript engine (V8, inside an Android WebView) give the same
   answer, byte for byte, for every vector and for a corpus of 312 label texts.

## Results

| Device | Android | Shared vectors in the app runtime | QuickJS against WebView V8 |
|---|---|---|---|
| Emulator `pls_phone` (Play image, `sdk_gphone64_arm64`) | 17 (API 37) | PASS: box 29, guards 64, destinations 21 | PASS: 426 inputs equal (114 vectors, 312 labels) |
| Samsung A16 (SM-A166U) | 16 (API 36) | PASS: box 30, guards 64, destinations 21 | PASS: 427 inputs equal (115 vectors, 312 labels) |

- Emulator: WebView (V8) 145.0.7632.218. Rules bundle SHA-256
  `52e8fb4305082c1a5ac9673a144e4e7bddaf93620aebe4073da7c9c1cba60b48`, built from commit 4c64439 with a
  clean tree. Run on 2026-11-19.
- A16: WebView (V8) 157.0.8103.50. The app was the release APK attached to the `android-judge-2` release
  (`before-you-tape-android-59c5914.apk`, SHA-256 `8b9f332dc7f681caf8a9d23a8b57e8ce8310b50b1e66edfa6407f88a5e3cade9`,
  checked on the phone before and after), with its rules bundle (SHA-256
  `350bddbda7261caf36c21389b783839d28c9e35a91e5f682f200eecb28707713`) and edition `byt-3b5f5508968f`
  (revision 2). The test package was built from commit 59c5914 for the release build and run with
  `am instrument`. 4 tests, 0 failures, at 2026-11-21T17:37Z. The vectors had grown by one box case
  since the emulator run.
- The app refuses a bundle whose SHA-256 differs from its build manifest, so these are the exact bytes
  both engines ran.

## What was compared

- Box and guard vectors (93): the full reply text of `BYT.evaluateBoxJson` for the same input text.
- Destination vectors (21): the full reply text of `BYT.destinationHitsJson`.
- Label corpus (312): the reply text of `BYT.labelTagsJson` for each case in
  `android/app/src/androidTest/assets/label-corpus.json`: all 69 distinct label texts in the vectors,
  plus our own cases (none copied from a USPS page) crossed with what the engine must read the same
  way: no-break spaces, each Unicode hyphen the engine normalizes, full-width letters, accented words
  next to rule words, "ALCOHOL" then a line break then "FREE", "0 % alcohol", and empty text.
  `android/tools/label_corpus.py` builds it.

## Controls

- A wrong expectation planted in one vector is reported (`DeviceVectorsTest.aPlantedWrongExpectationIsReported`),
  so the vector run cannot pass by checking nothing.
- A different label fed to the WebView side once is reported (`EngineDifferentialTest.aPlantedDifferenceIsReported`),
  so the comparison cannot pass by comparing nothing.

## Not yet done

- `SameBoxSameVerdictLiveTest` (a box the laptop filled, checked on the phone against the laptop's
  verdicts). It needs joining a laptop box from the phone (Task 11).

## How to run

```
cd android
ANDROID_SERIAL=<device> ./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=app.beforeyoutape.android.engine.DeviceVectorsTest,app.beforeyoutape.android.engine.EngineDifferentialTest
```

The counts, the device, the WebView version and the bundle hash are logged on the `BYT-PARITY` tag.

To check a release APK itself, install it with `adb install -r`, leave the test package installed after a
`-Pbyt.testBuildType=release` run (`-Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true`), install the
APK again (the Gradle run replaces it with its own build), and run
`adb shell am instrument -w -e class app.beforeyoutape.android.engine.DeviceVectorsTest,app.beforeyoutape.android.engine.EngineDifferentialTest app.beforeyoutape.android.test/androidx.test.runner.AndroidJUnitRunner`.

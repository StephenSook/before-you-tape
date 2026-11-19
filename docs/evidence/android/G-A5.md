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
| Samsung A16 (SM-A166U) | 16 (API 36) | Not run yet: needs the phone on USB | Not run yet |

- WebView (V8): 145.0.7632.218 on the emulator.
- Rules bundle SHA-256: `52e8fb4305082c1a5ac9673a144e4e7bddaf93620aebe4073da7c9c1cba60b48`, built
  from commit 4c64439 with a clean tree. The app refuses a bundle whose SHA-256 differs from its
  build manifest, so these are the exact bytes both engines ran.
- Run on 2026-11-19.

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

- The A16 run. It needs Stephen's phone connected by USB.
- `SameBoxSameVerdictLiveTest` (a box the laptop filled, checked on the phone against the laptop's
  verdicts). It needs joining a laptop box from the phone (Task 11).

## How to run

```
cd android
ANDROID_SERIAL=<device> ./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=app.beforeyoutape.android.engine.DeviceVectorsTest,app.beforeyoutape.android.engine.EngineDifferentialTest
```

The counts, the device, the WebView version and the bundle hash are logged on the `BYT-PARITY` tag.

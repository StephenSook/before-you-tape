# Before You Tape for iPhone

A native iPhone client for Before You Tape: point the camera at an item's label, and the app
reads it and shows the same three verdicts as the web app, from the same rules. Work in progress.
The box is kept on the phone only: joining a box started in the web app is not built yet.

- Rules: the web app's own rules engine, built into one file and run in JavaScriptCore, so the
  phone and the laptop run the same code.
- Reading: Apple's on-device model, or Gemini in the cloud through Firebase AI Logic when you
  allow it. A model only reads; the rules decide.
- Checks: `bash ios/scripts/ci-local-ios.sh` runs the repository's checks and the iPhone
  client's own.

The iPhone client is not part of the entry until its on-device read passes an airplane-mode test
on a real iPhone.

## Known failures

`bash ios/scripts/ci-local-ios.sh` does not pass on this Mac today (Xcode 27.2, iPhone 17 Pro
simulator, iOS 27.2). The four tests below fail. They fail the same way at 018c4b3, whose
changelog entry recorded a green run, so the cause is likely the local toolchain rather than the
code; it has not been found. They are not fixed yet. Every other app test passes.

| Test | Symptom | First seen |
|---|---|---|
| `SignedInCloudTests.theAppsCloudRunnerReadsTheLivePauseSwitch()` | The test process crashes (`Runner._applyScopingTraits`) | 2026-11-19 at 02ba81c; also fails at 018c4b3 |
| `SignedInCloudTests.theAppsReaderBuildsEveryCloudRunnerBehindSignIn()` | The test process crashes (`Runner._applyScopingTraits`) | 2026-11-19 at 02ba81c; also fails at 018c4b3 |
| `SignedInCloudTests.turningOffCloudChecksCancelsAnUploadInFlight()` | The test process crashes | 2026-11-19 at 02ba81c; also fails at 018c4b3 |
| `LoopUITests.testReadAVerdictThenFlipTheCountry()` | `Failed to tap "Check an item" Button: No matches found` | 2026-11-19 at 02ba81c; also fails at 018c4b3 |

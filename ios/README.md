# Before You Tape for iPhone

A native iPhone client for Before You Tape: point the camera at an item's label, and the app
reads it and shows the same three verdicts as the web app, from the same rules. Work in progress.
The box is kept on the phone only: joining a box started in the web app is not built yet.

- Rules: the web app's own rules engine, built into one file and run in JavaScriptCore, so the
  phone and the laptop run the same code.
- Reading: a label photo or the label's words go to Apple's on-device model (iOS 27; a photo goes
  as an image when the model reports image understanding), or to Gemini in the cloud through
  Firebase AI Logic when you allow it. A model only reads; the rules decide. Once you allow cloud
  checks, a photo read on the iPhone also gets a cloud second look when the web app's rules ask
  for one, and the two reads are merged by the same engine; label words get none
  (docs/LIMITS.md).
- Checks: `bash ios/scripts/ci-local-ios.sh` runs the repository's checks and the iPhone
  client's own. It needs `ios/BYT/Config/GoogleService-Info.plist`, which is gitignored.
- Tests and Debug builds call no Firebase service over the network: no sign-in, no Remote Config
  fetch, no Firestore read, and so no cloud read. Each skipped call says so in the log. A Debug run
  reaches the live project only when launched with `-liveFirebase` and not under XCTest; it then
  needs an App Check debug token registered for the app. Release builds always call it.

On 2026-11-20 its on-device photo read passed an airplane-mode test on a real iPhone 17 Pro
(iOS 27.2.1): 22 label photos, all 22 read on the phone, none in the cloud. The record is in
`docs/evidence/ios/2026-11-20-device/`.

## Test status

`bash ios/scripts/ci-local-ios.sh` passes on this Mac (Xcode 27.2, iPhone 17 Pro simulator,
iOS 27.2) as of 2026-11-20. The four app tests that failed on 2026-11-19 (three
`SignedInCloudTests` crashed the test process; `LoopUITests` could not find "Check an item") fail
in a checkout without the Firebase settings file and pass with it: the app shows its
missing-settings screen, and those three tests build the cloud client with no Firebase app. The
mirror now stops first and says the file is missing.

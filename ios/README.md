# Before You Tape for iPhone

The iPhone app of Before You Tape, one of its three parts beside the web app and the Android app.
Point the camera at an item's label. The app reads it and gives the same three verdicts as the web
app (OK to pack, Check this, Take it out), from the same rules engine.

Limits:

- The box stays on this iPhone. Joining a box started in the web app is not built.
- iPhone only, iOS 27 or later.

## Get it

- App Store: version 1.0.0 (build 4, from main at 14d6f7c) went to App Review on 2026-11-26 and
  is waiting for review. The review of build 2 was cancelled. Once Apple approves and releases it,
  it is at <https://apps.apple.com/app/id6837766123>, in every App Store region except France and
  China mainland. Until then that link does not open.
- TestFlight: there is no public test link. Apple's beta review step fails for this developer team,
  so a public TestFlight link cannot be turned on.
- Until the App Store release: the demo video shows the app on a real iPhone 17 Pro, and the device
  record below shows what it read.

Build 4 has rule edition revision 9 built in, the revision the web app runs, with no Canada
suspension (docs/LIMITS.md). Its suspension list, read on 2026-11-25, counts as current through
2026-12-16 by the phone's own date. From 2026-12-17 an out-of-date layer adds "Check this" to every
item, so build 4 gives no "OK to pack" until a newer edition reaches the phone. The app never trades
the edition it runs for an older pinned one.

## How it works

- Rules: the web app's own rules engine, built into one file and run in JavaScriptCore, so the
  phone and the laptop run the same code.
- Reading: a label photo or the label's words go to Apple's on-device model (iOS 27; a photo goes
  as an image when the model reports image understanding), or to Gemini in the cloud through
  Firebase AI Logic when you allow it. A model only reads; the rules decide. Once you allow cloud
  checks, a photo read on the iPhone also gets a cloud second look when the web app's rules ask
  for one, and the two reads are merged by the same engine; label words get none
  (docs/LIMITS.md).
- Checks: `bash ios/scripts/ci-local-ios.sh` runs the repository's checks and the iPhone
  app's own. It needs `ios/BYT/Config/GoogleService-Info.plist`, which is gitignored. Without it
  the app shows its missing-settings screen, and the script stops first and says the file is
  missing.
- Tests and Debug builds call no Firebase service over the network: no sign-in, no Remote Config
  fetch, no Firestore read, and so no cloud read. Each skipped call says so in the log. A Debug run
  reaches the live project only when launched with `-liveFirebase` and not under XCTest; it then
  needs an App Check debug token registered for the app. Release builds always call it.

## On a real iPhone

On 2026-11-20 the on-device photo read passed an airplane-mode test on a real iPhone 17 Pro
(iOS 27.2.1), with a Release build of main at d008a3e installed over USB: 22 label photos, all 22
read on the phone, none in the cloud. The record is in `docs/evidence/ios/2026-11-20-device/`.

## Test status

`bash ios/scripts/ci-local-ios.sh` passed on 2026-11-25 at d39d8ad (Xcode 27.2, iPhone 17 Pro
simulator, iOS 27.2): 292 app tests (291 passed, 1 skipped), 38 BYTCore tests, 1260 web tests and
an unsigned device build. These app tests are not in GitHub CI, so run the script on a Mac before
merging a rules or engine change.

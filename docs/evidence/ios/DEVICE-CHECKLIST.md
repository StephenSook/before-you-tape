# iPhone airplane-mode check

One page, about 30 minutes. The goal: the iPhone app reads 5 real label photos with Apple's
on-device model while the phone is in airplane mode, and the rules (not the model) give each
verdict. Each read's route and time are written down, and the evidence goes in this folder.

## What you need

- The Mac with this repository, on the commit to test. The script records the commit.
- The iPhone 17 Pro (iOS 27.2.1), its USB-C cable, and Developer Mode on.
- Apple Intelligence on, with its model downloaded: Settings > Apple Intelligence & Siri. The
  phone's language: English.
- `ios/BYT/Config/GoogleService-Info.plist` on the Mac (it is gitignored).
- 5 real items with printed labels. A mix, for example:
  1. a body lotion or hand cream,
  2. a perfume or a spray,
  3. a hand sanitizer or nail polish,
  4. a power bank or a battery with its numbers printed,
  5. a packaged food or a book.

## Steps

1. Connect the iPhone and unlock it. On the Mac, run `bash ios/scripts/device-session.sh build`.
   It prints the commit and the phone's UDID. The phone owner answers any signing prompt.
2. Run `bash ios/scripts/device-session.sh install`. The app opens on the phone.
3. On the phone, read the Ready check screen. Write down its two lines about the model.
   They must say "This iPhone can check items with no network." and "Label photos are read on
   this iPhone, with no network."
4. Turn on airplane mode. Turn Wi-Fi off too, because airplane mode can leave it on. Open
   Control Center and take a screenshot that shows airplane mode on and Wi-Fi off.
5. Start a screen recording from Control Center. Keep it on for all 5 items.
6. For each item:
   1. Tap "Check an item".
   2. Hold the label inside the white frame. Tap "Check now".
   3. Wait for the line under the photo. Write down the whole line.
   4. A pass ends "Read on this iPhone." If the cloud question appears, or the line says the
      item could not be read, write that down: it is a fail for that item.
   5. Go back to the Ready check screen.
7. Stop the screen recording. Keep airplane mode on.
8. On the Mac, run `bash ios/scripts/device-session.sh pull`. It copies the saved box from the
   phone into `docs/evidence/ios/<date>-device/`, with the device details and the commit, and
   prints each item's route (`phone_on_device` or `phone_cloud`) and read time in ms.
9. Move the screenshot and the screen recording into the same folder. Turn airplane mode off.

If step 8 cannot copy the box, write that down with the error. The screen recording and the
written lines are then the record.

## Record (one row per item)

| # | Item | Line on screen | Route (box file) | Read time ms | Verdict as the rules give it |
|---|------|----------------|------------------|--------------|------------------------------|
| 1 |      |                |                  |              |                              |
| 2 |      |                |                  |              |                              |
| 3 |      |                |                  |              |                              |
| 4 |      |                |                  |              |                              |
| 5 |      |                |                  |              |                              |

## Pass or fail

- Pass: all 5 reads have route `phone_on_device`, each line ends "Read on this iPhone.", and
  airplane mode was on for all of them (screenshot and recording).
- Fail: any read went to the cloud question, or any line says the item could not be read.
  Write down which item and the exact line. A fail is recorded, not hidden.

## Before the session (optional)

On the Mac, the same read path can be tried on the simulator, which uses the Mac's own Apple
model (not the iPhone's):
`TEST_RUNNER_BYT_LIVE_MODEL=1 xcodebuild -project ios/BYT.xcodeproj -scheme BYT -destination 'platform=iOS Simulator,name=iPhone 18 Pro,OS=27.2' test -only-testing:BYTTests/LiveModelTests`

## After

- The iPhone README keeps "not part of the entry" until a pass is recorded here.
- Close what was opened: Xcode if it opened, and `xcrun simctl shutdown all`.

# iPhone cloud second look, 2026-11-26

**Result: pass.** On a real iPhone, Apple's on-device model read a power bank photo. Then the app's own
second look sent the same crop to Gemini through Firebase AI Logic (`gemini-3.5-flash-lite`), and the
answer came back in 2,181 ms. App Check on that call used App Attest: the build has no other provider,
and App Check counted the call as a valid iOS request.

**How the photo got in:** the photo was fed by a test, through the app's own `readPhoto`. The cloud call
was real, and it ran on the real iPhone. No one held an item to the camera, and the phone's photo library
was not used.

## What was tested

- Phone: iPhone 17 Pro (iPhone18,1), iOS 27.2.1 (24B156), Developer Mode on, paired over Wi-Fi
  (`device.txt`).
- App: main at 3250df7 (rule edition revision 9, `byt-d098b14aa534`), built in the Release configuration
  with `ENABLE_TESTABILITY=YES`. It was signed for development (`get-task-allow`) and installed by
  `xcodebuild test-without-building` (`commit.txt`). Its App Attest environment entitlement is
  `production`. In Release, `BYTAppCheckFactory` returns only `AppAttestProvider`, and Firebase is live.
  `CFBundleVersion` is 3, the build number on main at that commit.
- Test: `ios/BYTTests/LiveCloudLookTests.swift`. It is opt-in, and runs only with
  `TEST_RUNNER_BYT_LIVE_CLOUD=1`. It feeds `public/eval/items/own-01.jpg` (the public photo, with its
  maker and address lines blurred) to `AppModel.readPhoto`. It uses the app's own reader
  (`AppModel.makeReader`: sign-in, the cloud runner with limited-use App Check tokens, the engine's
  parser), and it logs each model call on its way through. Before the read, it answers the cloud
  question with "allow", through the app's own `answerConsent(true)`.
- The box was kept in memory. The box saved on the phone was not read or changed.

## What was seen (`run.txt`)

1. App Check provider at run time: `FIRAppAttestProvider`.
2. First read: on the phone, `apple-on-device`. Route `hybrid`, reason `on_device_default`, 4,547 ms,
   974 input and 115 output tokens. The screen line was "Power bank: Take it out. Read on this iPhone."
3. The rules asked for a second look ("Battery numbers decide what may be mailed, so the cloud read them
   again."). The app ran it with `ItemReader.secondLook`: route `cloud_only`, reason `second_look`. The
   model was `gemini-3.5-flash-lite`, built from `ai.geminiLanguageModel` at
   `ios/BYT/AI/ModelSessionFactory.swift:140`. It answered `ok` in 2,181 ms, started 02:19:33 UTC,
   with 1,202 input and 159 output tokens. There was no fallback.
4. The box's counters: 1 read on the device, 0 in the cloud, 1 second look, 0 cloud fallbacks
   (`box.json`).
5. The two reads disagree, and the box keeps both:
   - The phone read `other_electronics`, `item_seen`, 0 Wh.
   - The second look read `power_bank`, `label_read`, 3.7 V, 50,000 mAh and 185 Wh. These are the
     figures printed on this label.
   - The card says "The two reads disagree. Pick what the item shows." (`box-screen.png`, the box
     screen drawn on the phone; the window drawing has no status bar.)
6. App Check's own count (`appcheck-metrics.json`, Cloud Monitoring
   `firebaseappcheck.googleapis.com/services/verification_count`, read 02:21:28 UTC): for the iOS app,
   1 request to `firebaseml.googleapis.com` (AI Logic) was `VALID` and `ALLOW` in the minute
   02:19:22 to 02:20:22 UTC. App Check is enforced on that service. No other iOS client called the
   model in that minute.

## What this does not show

- A photo from the camera or the photo picker. Here the test handed the photo to `readPhoto`.
- A tap on the cloud question. The test called the handler behind it.
- The App Store or Ad Hoc distribution signature. This build was signed for development, with the
  production App Attest environment.
- Whether the cloud read is always right. It was right for this label's printed figures in this one run.
- The reply's own `modelVersion`. The model name is the one the app's cloud runner was built with.

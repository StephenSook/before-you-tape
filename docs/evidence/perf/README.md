# The first live `ai_read` traces, 2026-11-23

Each Firebase AI Logic call sends one Firebase Performance Monitoring custom trace, `ai_read`
([`src/telemetry/aiTrace.ts`](../../../src/telemetry/aiTrace.ts), and `ai/AiTrace.kt` in the Android app). These are the
first ones read back from the console: an on-device read on the web, and a cloud read on Android. All times are UTC.

## On the web: an on-device read

- **The site:** the live site at 1d5e13c (`/version.json`: sha 1d5e13c, dirty false, built 21:08:10).
- **The browser:** desktop Chrome 157 on a Mac, not driven by a test runner (`navigator.webdriver` false), with
  Chrome's built-in model "available" and cloud checks already allowed in that browser. The tab was reloaded onto the
  new version first.
- **The read:** on `/judge`, **Run one live read** read the sample lotion photo (as taken; from 2026-11-25 the live read
  reads a copy with its brand blurred) on the device. The page showed "Read on
  this device, 15.2 s" and "Take it out for the Philippines". The page then sent one request to Performance
  Monitoring's upload host, `firebaselogging-pa.googleapis.com`, which answered 200.
- **The console**, read at about 21:14: Performance, the web app, Custom traces, `ai_read`: 1 sample, 15.14 s. Split by
  the `source` attribute: `on_device`, 100% of samples, 15.14 s
  ([`ai_read-by-source-web-2026-11-23.jpg`](ai_read-by-source-web-2026-11-23.jpg)). The trace times the SDK call; the
  page's 15.2 s also includes preparing the sample photo.

## On Android: a cloud read

- **The app:** the `android-judge-6` release build (`before-you-tape-android-1d5e13c.apk`, SHA-256
  `795253ba...73d1`) on a Samsung A16 (SM-A166U), Android 16. It passed its release gate first
  ([`../android/a16-2026-11-23/judge-6.md`](../android/a16-2026-11-23/judge-6.md)). The phone has no on-device model, so
  its reads go to the cloud.
- **The read:** cloud reads were allowed on the phone, the destination set to the Philippines, and the eval set's
  composition notebook photo (`public/eval/items/i21.jpg`, CC BY 2.0) picked with Add a photo. The app's screen, read
  from its UI tree, showed "Composition Notebook", "OK to pack" and "Read in the cloud, from this phone, in 6.9 s." The
  test photo was then deleted from the phone and the item removed from the box.
- **The console**, read at about 23:24: Performance, the Android app, Custom traces, `ai_read`: 1 sample, 6.83 s, with
  the `latency_ms` metric. Split by the `source` attribute: `in_cloud`, 100% of samples, 6.83 s
  ([`ai_read-by-source-android-2026-11-23.jpg`](ai_read-by-source-android-2026-11-23.jpg)). At about 23:15 the console
  showed only the library's own app-start and foreground traces from this build; the `ai_read` trace arrived within
  about ten minutes.

Not shown yet:

- An `in_cloud` sample on the web, and an `on_device` sample on Android: the web cloud read needs a browser without the
  built-in model, and the Android on-device read needs a phone with Gemini Nano.

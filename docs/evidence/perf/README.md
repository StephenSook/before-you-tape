# The first live `ai_read` trace, 2026-11-23

Each Firebase AI Logic call sends one Firebase Performance Monitoring custom trace, `ai_read`
([`src/telemetry/aiTrace.ts`](../../../src/telemetry/aiTrace.ts)). This is the first one read back from the console.
All times are UTC.

- **The site:** the live site at 1d5e13c (`/version.json`: sha 1d5e13c, dirty false, built 21:08:10).
- **The browser:** desktop Chrome 157 on a Mac, not driven by a test runner (`navigator.webdriver` false), with
  Chrome's built-in model "available" and cloud checks already allowed in that browser. The tab was reloaded onto the
  new version first.
- **The read:** on `/judge`, **Run one live read** read the sample lotion photo on the device. The page showed "Read on
  this device, 15.2 s" and "Take it out for the Philippines". The page then sent one request to Performance
  Monitoring's upload host, `firebaselogging-pa.googleapis.com`, which answered 200.
- **The console**, read at about 21:14: Performance, the web app, Custom traces, `ai_read`: 1 sample, 15.14 s. Split by
  the `source` attribute: `on_device`, 100% of samples, 15.14 s
  ([`ai_read-by-source-web-2026-11-23.jpg`](ai_read-by-source-web-2026-11-23.jpg)). The trace times the SDK call; the
  page's 15.2 s also includes preparing the sample photo.

Not shown yet:

- An `in_cloud` sample. On the web, the judge page reads in the cloud only where the browser has no built-in model,
  after the sender allows cloud checks. No such read was run for this record.
- Android traces. They come only from release builds made from 1d5e13c or later; debug builds send none. The
  `android-judge-6` build carries them and passed its release gate on the Samsung A16
  ([`../android/a16-2026-11-23/judge-6.md`](../android/a16-2026-11-23/judge-6.md)), but no read has run in that app
  yet: the A16 has no on-device model, and its cloud question is still unanswered.

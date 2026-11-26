# The web cloud second look on the live site, 2026-11-25

A photo the browser's built-in model read gets a second look in the cloud when the rules ask for one. This is that
path on the live site, in the project owner's own Chrome on a Mac, with the built-in model available. All times are UTC.
The screen recording of it is kept outside the repository; its SHA-256 is in [`read.json`](read.json).

- **The site:** the live site at 04719ef (its `version.json` at the time), on a first visit: the saved box deleted, the
  site's storage cleared, then a reload at 19:44:24.
- **The browser:** Google Chrome 158 (full version not recorded), with `LanguageModel.availability()` answering
  "available".
- **The first read:** **Check this part** on the power bank photo (eval item own-01) at 19:49:03. The page showed "Read
  on this device, 20.6 s", "Take it out" and "Label read: 5 V, 5,000 mAh", with **Check it in the cloud**. No AI Logic
  request was made for it.
- **The second look:** **Check it in the cloud** at 19:50:41, then **Allow** on the cloud question at 19:51:49.809. The
  AI Logic `generateContent` request for `gemini-3.5-flash-lite` started 0.64 s later and took 1,886 ms. It was the
  only AI Logic request from the page load to the end of the take. The card then read "Label read: 3.7 V, 50,000 mAh,
  185 Wh", "Read on this device, then checked in the cloud" and "Battery numbers decide what may be mailed, so the cloud
  read them again.", and asked "The two reads disagree. Pick what the item shows." beside both reads: its box (Sealed,
  or Open or no box), the battery numbers (5 V, 5000 mAh, or 3.7 V, 50000 mAh, 185 Wh) and the battery words (Not seen,
  or Yes). Neither was pressed. The power bank's label prints "Capacity:50000mAh 3.7V185Wh"
  ([`public/eval/items/own-01.jpg`](../../../public/eval/items/own-01.jpg)), so the second look read it right and the
  first read did not.
- **Frames checked:** the recording at 60 s shows the first read and "Cloud: off"; at 252 s, the second look's card with
  both reads.

[`read.json`](read.json) holds the steps, the AI Logic request's timing and the screen text. Not recorded: the Mac's
model and macOS version, the reply's `modelVersion`, and the request's HTTP status.

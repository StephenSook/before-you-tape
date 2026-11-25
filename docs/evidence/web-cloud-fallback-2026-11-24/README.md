# The web cloud fallback on the demo Chrome, 2026-11-24

The app falls back to the cloud when the browser has no built-in model. This is that path on the demo Mac's own Chrome
binary, in a new profile that had never downloaded Chrome's model, against the live site. All times are UTC.

- **The site:** the live `/judge` at 19ec8ec, running its entry script `index-rj9Zri78.js`.
- **The browser:** Google Chrome 158.0.8127.38 (the Mac's installed Chrome, updated since the 157 runs in
  `docs/TEST-MATRIX.md`), started with a throwaway `--user-data-dir` that was deleted afterwards. The everyday profile was
  not used or changed. `navigator.webdriver` was false, and `LanguageModel.availability` answered "downloadable": the
  model was not on this profile.
- **The read:** **Run one live read** at 13:57:16. The page asked the cloud question, and Allow was clicked at
  13:57:39.649 on the project owner's go. App Check's reCAPTCHA Enterprise exchange answered 200 at 13:57:46.043, and the
  AI Logic `generateContent` request for `gemini-3.5-flash-lite` answered 200 at 13:57:46.315. The page showed "Read in
  the cloud, 3.5 s", "Take it out for the Philippines" and "The model read: eos body lotion"
  ([`after-allow.png`](after-allow.png)). Performance Monitoring's settings fetch and its upload then answered 200.
- **Checked again** at 13:59:23 in the same tab: the same three lines, the cloud choice stored, and the model still
  "downloadable".

[`read.json`](read.json) holds the steps, the network rows for App Check, AI Logic and Performance Monitoring, and the
panel text. The web `in_cloud` sample of the `ai_read` trace was not read back from the console for this record.

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

# Before You Tape on a real phone, 2026-11-18

The release-signed Android app on a Samsung A16 (SM-A166U, Android 16, API 36), against the
deployed Firebase project. Build: main at f64dd6d, release type, signed with the release key.
App Check used Play Integrity. No camera image was taken: the camera permission was refused
when asked, so the camera never opened.

| File | What it shows |
|---|---|
| `01-first-screen.png` | The first screen, the cloud consent: "To check items when this phone can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?" This is the copy for a phone with no on-device model; a phone that can download one is offered "Get the model on this phone" |
| `02-home.png` | Before a destination: "Choose where the box is going first." |
| `03-sending-to-canada.png` | "Sending to Canada", "Camera is off. Add a photo instead.", with "Add a photo" and "Type it" |
| `04-type-it-form.png` | The form for typing an item by hand |
| `05-verdict.png` | A typed "Lotion or cream" to Canada: "OK to pack", "Typed by you", "How many: 1" |

Same phone, same build, by instrumentation (no screen): the release App Check probe got a Play
Integrity token (1037 characters), signed in, and read the known label in the cloud as a
`power_bank` (source `IN_CLOUD`, route `CLOUD_ONLY`). 1 test, 0 failures. On the emulator the
same probe got "403 App attestation failed"; a real device passes.

The phone has no AICore package, so no on-device model can run on it. The app has no About
screen yet; the consent screen above is the app's own sign of that.

How the stills were checked: each is the screen at full width, cropped to rows 100 to 2205 of
2340, which removes the status bar and the navigation bar, so nothing from the phone's own
notifications shows. Each was checked by eye. No account, code or token appears in this app.

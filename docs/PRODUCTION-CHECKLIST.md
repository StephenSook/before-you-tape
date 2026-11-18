# Production checklist

What to do, in order, when the live site needs protecting or checking.

## If something is calling the cloud model that should not be

Use the smallest switch that stops it, and say what you did.

1. **`kill_cloud` in Remote Config.** Set it to `true` and publish. Every cloud read, second look and description stops; reads on the device keep working, and the page says "Cloud checks are paused. Checks on this laptop still work." Live since `901ecb3`: open pages pick it up in a few seconds with no reload (see `docs/evidence/kill-cloud-flip-*.json`).
2. **The per-user quota.** Lower "Generate content requests per minute per project per user" on the Firebase AI Logic API from 20 toward 0 (a consumer override; the API asks for the narrow safety-check bypass `LIMIT_DECREASE_PERCENTAGE_TOO_HIGH` for a cut of more than 10 percent). It can be raised again at once.
3. **Turn off the Firebase AI Logic API** (`firebasevertexai.googleapis.com`) on the project. This stops every cloud read at once and also breaks the App Check control test. Ask before doing this.

The $25 Gemini spend cap stays in place under all three; its enforcement is not instant.

## Publishing the Remote Config template

Only through `ACCESS_TOKEN="$(gcloud auth print-access-token)" npm run rc:publish -- --dry-run`, then again without `--dry-run`. It reads the live template first and refuses to change or drop a live value, such as a `kill_cloud` an operator turned on, unless that key is named with `--allow KEY`. `firebase.json` does not name the template, so no plain `firebase deploy` can publish it.

## After every deploy

A matching `version.json` does not mean the app works: on 2026-11-18 it matched for almost an hour while every visitor saw "The checker could not start." Only a check of the started screen shows that the app works.

- The app starts: the page shows "Type an item" and no error banner (`BYT_LIVE=1 npx playwright test --project=live tests/e2e/starts.spec.ts`; deploy-live and the daily probe run it too).
- A saved box comes back from the server: a typed item shows in a second browser that has only the first one's sign-in, with no Firestore cache or local copy (`BYT_LIVE=1 npx playwright test --project=live tests/e2e/roundtrip.live.spec.ts`; deploy-live runs it, and each run leaves one box with one item named "Round-trip check <time>").
- The live `version.json` reports the main commit with `dirty` false.
- `BYT_LIVE=1 npx playwright test --project=live` passes (the served commit, the started app, a saved box read back from the server, the home page, `robots.txt` and `llms.txt` as plain text, and axe at 1440 and 390 px).
- `npm run appcheck:control` gives 401 without a token, then 200 with a limited-use token.

## Before the repository goes public

- `npm run release:gate` passes: every listing checked by a person, and every rule layer still fresh on the last judging day.
- The deployed bundle holds no prompt text beyond what the app sends, no key beyond the public Firebase config, and takes model names from Remote Config.

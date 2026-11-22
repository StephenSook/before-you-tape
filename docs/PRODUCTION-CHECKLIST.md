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

## Sending a newer rule edition to the phone apps

The phone apps carry the edition they were built with. A newer one reaches them without a new build through the edition pin, in this order:

1. `npx tsx scripts/publish-edition.ts --dry-run` prints the `ruleEditions/{id}` document's id, size and SHA-256 and writes nothing. Then `ACCESS_TOKEN="$(gcloud auth print-access-token)" npx tsx scripts/publish-edition.ts` writes it. Read it back and check that the SHA-256 of its `json` field equals the printed hash.
2. `ACCESS_TOKEN=... npm run rc:publish -- --dry-run --set rules_edition_id=<id> --set rules_edition_sha256=<hash>` must show exactly those two changes. Then run it again without `--dry-run`. A later publish without `--set` refuses to drop the live pin unless it is allowed.

The apps use the pinned edition only when its id and hash match and its revision is higher than their own; otherwise they keep the built-in one. Undo: publish both values empty, or roll Remote Config back a version.

Never pin an edition that reads a fact the engine in a live app build does not know: that build refuses it and falls back to its built-in edition, which can be older than the edition pinned before (android-judge-3's is revision 4). Both scripts refuse such an edition. `publish-edition` will not write it (a dry run still prints its values, with the reason), and `rc-publish` will not set `rules_edition_id` to it, or to any edition other than the one in `rules/edition.json`. The facts every live build knows are listed in `rules/live-engines.json`; add one only once every live build's engine knows it. Revision 7 (`byt-56273cd51d25`) reads `battery.numbersFrom`, so it ships only as the built-in edition of new builds, and the pin stays at revision 6.

Done on 2026-11-21 for revision 5 (`byt-1e330a4fdf37`, SHA-256 `b63c55afc6a0c77b7c32a1457ff593f9cc13992b2821363291ade2cfab3038bc`) from main 50bbf3b: the document was written and read back (hash match, revision 5), and Remote Config went from version 5 to version 6 with exactly the two pin keys changed. On a Samsung A16, the published android-judge-3 (built with revision 4) showed "Rules edition: byt-1e330a4fdf37" on its About screen 15 seconds after a relaunch (21:48 UTC), with no notice ([`docs/evidence/android/a16-2026-11-21/README.md`](evidence/android/a16-2026-11-21/README.md)).

Done on 2026-11-21 for revision 6 (`byt-08f3b8c7ff31`, SHA-256 `292dbc6615008a737b8676514e72fcf6bff69c8725b6f49a9c59a33fe37ce4d7`, 43,461 bytes) from main 260a42c: the document was written and read back with a matching hash, and Remote Config went to version 7. Before the pin, the shared vectors passed on revision 6 with the Android emulator's engine and with the iPhone build's engine. After it, iPhone build 2 had revision 6 active on the device at 23:50:48 UTC: Remote Config's active edition was `byt-08f3b8c7ff31`, the document was in its read-only cache, and the Ready check showed no notice. A run on the A16 is not recorded yet.

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

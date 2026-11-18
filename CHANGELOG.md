# Changelog

All notable changes to this project are listed here.

## Unreleased

### Added

- `src/firebase/app.ts`: `initFirebase(env)` refuses a missing config value by name, starts App Check with the reCAPTCHA Enterprise key before Auth, Firestore or AI Logic can be called, and connects the emulators when `VITE_USE_EMULATORS` is "true". `getAi(useLimitedUseTokens)` builds one Firebase AI Logic instance on the Gemini Developer API and refuses a different token setting later, which the SDK would reject anyway. `ensureSignedIn(auth)` waits for a saved session before signing in anonymously, so a reload keeps the same user. Adds `firebase` 13.4.0, pinned. Source: plan Task 5. Verified by `src/firebase/app.test.ts` (7 tests), which failed before the module existed; local CI mirror exit 0.
- Firebase project config for `before-you-tape-2026`: `firebase.json` (Hosting serves `dist` as a single-page app, Firestore in `nam5`, anonymous sign-in), `.firebaserc`, `firestore.rules` (deny all reads and writes until the app's own rules land) and an empty `firestore.indexes.json`. Source: plan Task 5. Verified: the rules and the auth config were deployed and read back (deployed rules match the file; anonymous sign-in reads enabled); local CI mirror exit 0.
- Web app shell: Vite, React and strict TypeScript, with the routes `/`, `/judge`, `/measured`, `/rules`, `/ran`, `/about`, `/worksheet` and `/blind/:token`. The `/desk/listing` and `/desk/eval` routes exist in development builds only. Verified by `src/App.test.tsx`.
- `dist/version.json` with the commit SHA and build time, written at build.
- `scripts/tone-check.ts`: fails on long dashes and curly quotes in user-facing text, and fails when it walks fewer files than its floor. Verified by `scripts/tone-check.test.ts`.
- `scripts/model-guard.ts`: fails on banned browser AI APIs and model libraries, on `availability(` outside `src/ai/gate.ts`, and on `getGenerativeModel` outside `src/ai/firebaseModels.ts`, with a floor on files walked. Verified by `scripts/model-guard.test.ts`.
- CI on GitHub Actions (`ubuntu-24.04`): lint, type check, tests, build, tone check, model guard, gitleaks over full history, and a check that no commit message carries a co-author trailer.
- Apache-2.0 `LICENSE` and `NOTICE`.
- `src/shared/itemRead.ts`: the item-read contract, 16 required fields and 37 categories from one field table, which also builds the strict JSON Schema and the parser. The parser rejects non-JSON, missing or extra fields, wrong types, unknown enum values and negative numbers, names the bad field, and clips label text to 160 characters. Verified by `src/shared/itemRead.test.ts`.

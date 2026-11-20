# Before You Tape

Hold each gift up to your laptop and see what the post office won't take, before you tape the box.

**Live:** https://before-you-tape-2026.web.app

**Judges, start here:** https://before-you-tape-2026.web.app/judge. A ready sample box of nine real items. It needs no camera, no built-in model and no sign-in. Pick a country and the whole box is checked again by the app's own rules, with no model call.

## How it works

1. Hold an item to the camera, add a photo, or type what the label says.
2. Firebase AI Logic reads the label. It runs on the device when the browser has a built-in model, and in the cloud only after the sender says yes to cloud checks. The item-read models are set up in `src/ai/firebaseModels.ts`.
3. A rules engine in the browser (`src/engine/`) gives each item "OK to pack", "Check this" or "Take it out" for the country picked. Each rule layer carries the date it was read, and a layer past its limit turns "OK to pack" into "Check this". The limits are listed in [`docs/LIMITS.md`](docs/LIMITS.md).
4. The box is saved in Firestore, so it is still there when the page is opened again.

The same rules also run in an iPhone app that is not part of this entry ([`ios/README.md`](ios/README.md)) and in the Android app ([`android/RELEASE.md`](android/RELEASE.md)).

## Run it

Requirements: Node.js 22 and npm. The Firestore rules tests also need Java 21 or newer, for the Firestore emulator.

1. `npm ci`
2. Copy `.env.example` to `.env.local` and fill in your own Firebase web config and reCAPTCHA Enterprise site key. Never commit `.env.local`.
3. `npm run dev` starts the local server.

```bash
npm run test            # unit tests
npm run test:rules      # Firestore rules tests in the local emulator
npm run lint
npm run typecheck
npm run build           # writes dist/, including dist/version.json with the commit SHA ("unknown" in a copy with no git history)
npm run tone            # fails on long dashes and curly quotes in user-facing text
npm run guard           # fails on any model call outside Firebase AI Logic, speech recognition included (the system voice is allowed)
npm run hygiene         # flags private notes in tracked files (fails once the repository is public)
npm run edition:check   # fails when rules/edition.json is out of date with its part files
npm run build:embed     # the rules engine as one script for the iPhone and Android apps
npm run release:gate    # run before a release (see below)
```

## Checks on every push

`.github/workflows/ci.yml` runs, in order: the rule edition check, lint, type check, unit tests, the Firestore rules tests in the emulator, the build, a check that the build carries this commit's SHA, a check that no development page reached the production build, browser checks on the built app (it starts, every camera control is readable, and /judge works with no request to a Google API), the punctuation check, the model-call guard, the iOS model-call guard and its tests, a check that the iPhone's engine file is built from this commit's engine, the hygiene check, a secret scan of the full git history (gitleaks), and a check that no commit message carries a co-author line. `.github/workflows/android.yml` builds and tests the Android app.

## Release gate

`npm run release:gate` fails while any country listing has not been checked line by line by a person, or while any rule layer would be past its limit on the last judging day. It is run before a release, not on every commit.

## Security you can check

- **App Check is enforced for Firebase AI Logic.** A model call with the site's public web key but no App Check token is refused with HTTP 401 "Firebase App Check token is invalid." The exact `curl` is in [`docs/SECURITY.md`](docs/SECURITY.md#check-it-yourself), and the daily probe makes the same call.
- **Limited-use App Check tokens.** The web app asks for them when it creates its AI Logic instance (`getAi(true)` in `src/pages/PackRoute.tsx`, which sets `useLimitedUseAppCheckTokens` in `src/firebase/app.ts`). AI Logic enforces them (replay protection, since 2026-11-18).
- **Per-user rate limit.** AI Logic generate-content requests are limited to 20 a minute per user (the default is 100), read back on 2026-11-18. One sender checks items one at a time.
- Every row of Firebase's AI Logic security checklist, with its state, date and how to check it, is in [`docs/SECURITY.md`](docs/SECURITY.md).
- **Dependency audit (2026-11-19).** `npm audit --omit=dev` reports one package, `@grpc/grpc-js` 1.9.16, through Firestore's Node.js entry. Both advisories ([GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4)) are about gRPC servers. The built web app holds no gRPC code: a search of `dist/assets` for it finds nothing.

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.

Third-party tools with a different licence, used only in development and tests and never shipped in the app:

- `@axe-core/playwright` and `axe-core` (accessibility checks in the Playwright tests): Mozilla Public License 2.0.

Not affiliated with or approved by the US Postal Service.

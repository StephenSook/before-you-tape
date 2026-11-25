# Before You Tape

Hold each gift up to your camera and see what the post office won't take, before you tape the box.

**Live:** https://before-you-tape-2026.web.app

**Judges, start here:** https://before-you-tape-2026.web.app/judge. A ready sample box of nine real items. It needs no camera, no built-in model and no sign-in. Pick a country and the whole box is checked again by the app's own rules, with no model call. The box starts in the Philippines. USPS suspends mail to Canada from November 29, 2026, so pick Canada to see the app follow it.

To see a model run, press **Run one live read** on the same page. It reads the sample lotion photo with the app's real models: on your device when Chrome's built-in model is ready, otherwise in the cloud after you allow it. It shows where the read ran and the time from the press that started the read (the button, or Allow) to the verdict on screen. One read at a time, then a 10 s wait.

## How it works

1. Hold an item to the camera, add a photo, or type what the label says. With no camera or no item at hand, "Try a sample photo" shows a recorded read of one of our test photos, made earlier by a laptop's own model and labelled "Sample, recorded read", so no model runs. "Run one live read" on the Judges page reads the same photo live.
2. Firebase AI Logic reads the label. It runs on the device when the browser has a built-in model, and in the cloud only after the sender says yes to cloud checks. The item-read models are set up in `src/ai/firebaseModels.ts`. If a read fails or takes too long, nothing is guessed: the page says so, "Type an item" stays on the page, and the rules decide the typed item with no model call. Each AI Logic call also sends one Firebase Performance Monitoring trace, `ai_read`, with the route the SDK reported, the model, the outcome and the latency (`src/telemetry/aiTrace.ts`), because AI monitoring in the console shows cloud calls only. The first live ones, an on-device read on the web and a cloud read in the Android app, are in [`docs/evidence/perf/`](docs/evidence/perf/README.md).
3. A rules engine in the browser (`src/engine/`) gives each item "OK to pack", "Check this" or "Take it out" for the country picked. Each rule layer carries the date it was read, and a layer past its limit turns "OK to pack" into "Check this". The limits are listed in [`docs/LIMITS.md`](docs/LIMITS.md).
4. The box is saved in Firestore, so it is still there when the page is opened again, for about 30 days. **Delete my saved box**, under the box, deletes it sooner, with its photos on this device and the anonymous sign-in.
5. After one visit, the page opens with no connection: a service worker keeps the app's own files, with the rules inside them, so typed items are judged offline. A photo can be read offline only by the browser's built-in model, where Chrome has it: with the network off, the live site read a power bank photo that way and gave the right verdict, though it misread the battery numbers (November 21, 2026; the row "On-device only with the network off" in [`docs/TEST-MATRIX.md`](docs/TEST-MATRIX.md)). It keeps no answer from the cloud. A new version waits until you press **Reload**.

The same rules also run in an iPhone app that is not part of this entry ([`ios/README.md`](ios/README.md)) and in the Android app ([`android/RELEASE.md`](android/RELEASE.md)). The Android judge build is a signed APK on the [android-judge-7 release](https://github.com/StephenSook/before-you-tape/releases/tag/android-judge-7) (`before-you-tape-android-7170418.apk`, SHA-256 `f711035d7f72c2b48ee091851b2a9251b65a26f9521cdad03652620353795f72`), built from 7170418 with rule edition revision 7. That exact file read a photo on a Pixel 10's own model, with cloud reads off, and passed the release checks on a Samsung A16 ([`docs/evidence/android/judge-7-2026-11-25/README.md`](docs/evidence/android/judge-7-2026-11-25/README.md)). CI also builds a Chrome extension that is not part of this entry ([`extension/`](extension/)): it was not measured, and the bridge page it would use for cloud reads is closed on this site (`frame-ancestors 'none'` in `firebase.json`). What ran where, on which device and with which model, is in [`docs/TEST-MATRIX.md`](docs/TEST-MATRIX.md).

## Run it

Requirements: Node.js 24.12 or newer and npm (the Firebase SDK this app uses needs it). The Firestore rules tests also need Java 21 or newer, for the Firestore emulator.

1. `npm ci`
2. Copy `.env.example` to `.env.local` and fill in your own Firebase web config and reCAPTCHA Enterprise site key. Never commit `.env.local`.
3. `npm run dev` starts the local server.

A browser on localhost does not pass App Check: this project's reCAPTCHA key allows only the deployed site. Cloud checks there need an App Check debug token registered in the Firebase console; the browser tests take one from `APPCHECK_DEBUG_TOKEN` and set it in the page (`tests/e2e/fixtures.ts`). With your own Firebase project, you can add localhost to your own reCAPTCHA key instead.

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
npm run eval:baseline -- --baseline always_check --date 2026-11-21   # an eval baseline on eval/set, no model call (eval/PROTOCOL.md)
```

## Checks on every push

`.github/workflows/ci.yml` runs, in order: the rule edition check, a check that no rule layer reads stale before the last judging day, lint, type check, unit tests, the Firestore rules tests in the emulator, the build, the Chrome extension's build and package check, a check that the build carries this commit's SHA, a check that no development page reached the production build, browser checks on the built app (it starts, every camera control is readable, and /judge works with no request to a Google API), browser checks that need App Check (accessibility, a smoke run, the pack page with its model answered by the test, the live read on /judge, and that the CI debug token reaches only this app's own origins), the punctuation check, the model-call guard, the iOS model-call guard and its tests, a check that the iPhone's engine file is built from this commit's engine, the hygiene check, a secret scan of the full git history (gitleaks), and a check that no commit message carries a co-author line. `.github/workflows/android.yml` builds and tests the Android app.

## Release gate

`npm run release:gate` fails while any country listing has not been checked line by line by a person, or while any rule layer would be past its limit on the last judging day. It is run before a release, not on every commit.

It fails today, on purpose, for two reasons. No person has checked the Canada and Philippines listings yet. And the USPS service alerts were last read on 2026-11-20, so that layer reads stale from 2026-12-12, before the last judging day (2026-12-16). It passes once a person has checked both listings and the alerts have been read again on or after 2026-11-25.

## Security you can check

- **App Check is enforced for Firebase AI Logic.** A model call with the site's public web key but no App Check token is refused with HTTP 401 "Firebase App Check token is invalid." The exact `curl` is in [`docs/SECURITY.md`](docs/SECURITY.md#check-it-yourself), and the daily probe makes the same call.
- **Limited-use App Check tokens.** The web app asks for them when it creates its AI Logic instance (`getAi(true)` in `src/pages/packDeps.ts`, which sets `useLimitedUseAppCheckTokens` in `src/firebase/app.ts`). AI Logic enforces them (replay protection, since 2026-11-18).
- **Per-user rate limit.** AI Logic generate-content requests are limited to 20 a minute per user (the default is 100), read back on 2026-11-18. One sender checks items one at a time.
- Every row of Firebase's AI Logic security checklist, with its state, date and how to check it, is in [`docs/SECURITY.md`](docs/SECURITY.md).
- **Dependency audit (2026-11-19).** `npm audit --omit=dev` reports one package, `@grpc/grpc-js` 1.9.16, through Firestore's Node.js entry. Both advisories ([GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j), [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4)) are about gRPC servers. The built web app holds no gRPC code: a search of `dist/assets` for `grpc-js` finds nothing (the Firestore web SDK names gRPC only in a setting and an error message).

## License

Apache License 2.0. See `LICENSE` and `NOTICE`.

Third-party tools with a different licence, used only in development and tests and never shipped in the app:

- `@axe-core/playwright` and `axe-core` (accessibility checks in the Playwright tests): Mozilla Public License 2.0.

Not affiliated with or approved by the US Postal Service.

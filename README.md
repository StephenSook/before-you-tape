# Before You Tape

Hold each gift up to your camera and see what the post office won't take, before you tape the box.

**Live:** https://before-you-tape-2026.web.app

**Judges, start here:** https://before-you-tape-2026.web.app/judge. A ready sample box of nine real items. It needs no camera, no built-in model and no sign-in. Pick a country and the whole box is checked again by the app's own rules, with no model call. The box starts in the Philippines.

To see a model run, press **Run one live read** on the same page. It reads the sample lotion photo, with its brand blurred, with the app's real models: on your device when Chrome's built-in model is ready, otherwise in the cloud after you allow it. It shows where the read ran and the time from the press that started the read (the button, or Allow) to the verdict on screen. One read at a time, then a 10 s wait.

## How it works

1. Hold an item to the camera, add a photo, or type what the label says. With no camera or no item at hand, "Try a sample photo" shows a recorded read of one of our test photos, made earlier by a laptop's own model and labelled "Sample, recorded read", so no model runs. The photo is shown with its brand blurred, and the page says the read was recorded from the photo as taken. "Run one live read" on the Judges page reads the same photo, with its brand blurred, live.
2. Firebase AI Logic reads the label. It runs on the device when the browser has a built-in model, and in the cloud only after the sender says yes to cloud checks. The item-read models are set up in `src/ai/firebaseModels.ts`. If a read fails or takes too long, nothing is guessed: the page says so, "Type an item" stays on the page, and the rules decide the typed item with no model call. Each AI Logic call also sends one Firebase Performance Monitoring trace, `ai_read`, with the route the SDK reported, the model, the outcome and the latency (`src/telemetry/aiTrace.ts`), because AI monitoring in the console shows cloud calls only. The first live ones, an on-device read on the web and a cloud read in the Android app, are in [`docs/evidence/perf/`](docs/evidence/perf/README.md).
3. A rules engine in the browser (`src/engine/`) gives each item "OK to pack", "Check this" or "Take it out" for the country picked. Each rule layer carries the date it was read, and a layer past its limit turns "OK to pack" into "Check this". The limits are listed in [`docs/LIMITS.md`](docs/LIMITS.md).
4. The box is saved in Firestore, so it is still there when the page is opened again, for about 30 days. **Delete my saved box**, under the box, deletes it sooner, with its photos on this device and the anonymous sign-in.
5. After one visit, the page opens with no connection: a service worker keeps the app's own files, with the rules inside them, so typed items are judged offline. A photo can be read offline only by the browser's built-in model, where Chrome has it: with the network off, the live site read a power bank photo that way and gave the right verdict, though it misread the battery numbers (November 21, 2026; the row "On-device only with the network off" in [`docs/TEST-MATRIX.md`](docs/TEST-MATRIX.md)). It keeps no answer from the cloud. A new version waits until you press **Reload**.
6. An error the page did not expect goes to Firebase Crashlytics for web, with its message removed in the browser (`src/telemetry/errorReport.ts`): a report holds the kind of error from a fixed list, the code locations in this site's own loaded scripts (address, line and column, with no function name or query), a Firebase code from a fixed list or an HTTP status, the build, and random session and installation IDs, never a photo, label text, item name or box. The SDK loads only after the first such error, and one page sends at most five reports. A planted test error from a local production build of this change was accepted by Crashlytics' telemetry endpoint (HTTP 200) and is stored in the project's Cloud Logging (`firebasetelemetry.googleapis.com/events`, kept 30 days), holding none of the label text planted in its message (2026-11-26). What a report holds is listed on the [privacy page](https://before-you-tape-2026.web.app/privacy/).

The same rules also run in an Android app and an iPhone app, and both are part of this entry. The Android judge build ([`android/RELEASE.md`](android/RELEASE.md)) is a signed APK on the [android-judge-9 release](https://github.com/StephenSook/before-you-tape/releases/tag/android-judge-9) (`before-you-tape-android-3250df7.apk`, SHA-256 `1324d4a0f4b745c739b8b416228ec9c928d74c25f88f28f16681bfb8f54458ca`), built from 3250df7 with rule edition revision 9. That exact file passed the release checks on a Samsung A16 and a Pixel 10; on the Pixel, the app's own client read our power bank photo in the cloud with the label's numbers, and on the phone with them misread ([`docs/evidence/android/judge-9-2026-11-26/README.md`](docs/evidence/android/judge-9-2026-11-26/README.md)). Its engine is the same as `android-judge-8`'s, whose file, on a Pixel 10's own model with cloud reads off, read 26 of our 40 eval photos; run again with a 15 s pause between reads, it read 39 of 40. Each run called 1 hazard item it read "OK to pack" (1 of 24, then 1 of 27): the same perfume, read as makeup ([`docs/evidence/android/judge-8-2026-11-25/README.md`](docs/evidence/android/judge-8-2026-11-25/README.md)).

The iPhone app ([`ios/README.md`](ios/README.md)) reads a label photo with Apple's on-device model, or with Gemini in the cloud through Firebase AI Logic once you allow it ([`ios/BYT/AI/ModelSessionFactory.swift`](ios/BYT/AI/ModelSessionFactory.swift)); release builds use App Check with App Attest. It needs iOS 27. Without Apple's on-device model (an iPhone that can run it, with Apple Intelligence on), photos are read only in the cloud, when you allow it. With airplane mode on, a Release build of the app (main at d008a3e) on an iPhone 17 Pro read all 22 photos it was shown on the phone and none in the cloud; it reported reading the label in 7 and seeing only the item in 15 (2026-11-20, [`docs/evidence/ios/2026-11-20-device/README.md`](docs/evidence/ios/2026-11-20-device/README.md)). Version 1.0.0 (build 4, from main at 14d6f7c) was submitted for App Store review on 2026-11-26 and is waiting for review, so it can't be installed yet, and there is no public TestFlight link. The review of build 2 was cancelled. Build 4 has rule edition revision 9 built in, the revision the web app and the Android judge build run, with no Canada suspension, and it keeps its own edition when the edition pin names an older one. Its suspension list, read on 2026-11-25, counts as current through 2026-12-16 by the phone's own date. It keeps its box on the iPhone, not on the server ([`docs/LIMITS.md`](docs/LIMITS.md)).

CI also builds a Chrome extension that is not part of this entry ([`extension/`](extension/)): it was not measured, and the bridge page it would use for cloud reads is closed on this site (`frame-ancestors 'none'` in `firebase.json`). What ran where, on which device and with which model, is in [`docs/TEST-MATRIX.md`](docs/TEST-MATRIX.md).

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

`npm run release:gate` fails while any country listing has neither a person's line-by-line check nor an approval as a whole in [`rules/reviews.json`](rules/reviews.json) (two AI reviews of each line, then the project owner's approval of those same lines), or while any rule layer would be past its limit on the last judging day (2026-12-16). It is run before a release, not on every commit.

It passes today. The Canada and Philippines listings are approved as a whole in `rules/reviews.json` (checked by two AI reviews and approved by the project owner on 2026-11-21); no person has checked them line by line yet. The USPS service alerts were read again on 2026-11-25, so with their 21-day limit that layer reads checked through 2026-12-16. To read a saved copy of that page, run `npx tsx scripts/usps-alerts.ts <page.html>`: it lists only the rows of the page's suspension tables, and skips HTML comments and any banner marked inactive, such as the hidden one that once put a Canada suspension in the rules.

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

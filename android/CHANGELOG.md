# Android client changelog

The native Android app (`android/`). One entry per commit, newest first: what changed, its
source (plan task or finding) and how it was verified.

- **Every shared vector runs against the bundle on the JVM (gate G-A0).** `SharedVectorsTest`
  runs all 20 box, 64 review guard and 21 destination vectors through `EngineHost` in QuickJS,
  with the TypeScript engine tests' own assertions and the shared defaults file, checks the
  counts against the files, proves itself with a planted wrong expectation (exactly one
  failure, naming that vector and item), and checks that every guard vector pins every item.
  The result is recorded in `docs/evidence/android/G-A0.md`. Source: Android plan Task 3.
  Verified: 6 of 6 pass; `bash android/ci-local.sh` (14 tests) and the root CI mirror exit 0.

- **Engine host that runs the shared rules bundle.** `EngineHost` loads `byt-engine.js` into a
  `JsRuntime`, refuses a bundle whose SHA-256 differs from its manifest (`BundleMismatch`) or
  whose bridge version is not 1, and calls the JSON bridge: `setEdition`, `canonicalEdition`,
  `editionBodyCanonical`, `evaluateBox`, `destinationHits`, `labelTags`, `parseItemRead` and
  `itemReadContract`. Arguments reach JavaScript only as JSON string literals. A bridge error
  becomes an `EngineError` with the bridge's own name. `EngineModels.kt` mirrors the engine's
  JSON (unknown keys ignored), with enum constants named as the wire strings (37 categories,
  3 retail-box values, 3 evidence values) and `quantity` as a number, as in the engine. Kotlin
  holds no rule logic and no verdict words. Source: Android plan Task 3. Verified:
  `EngineHostTest`, `EditionHashTest` and `ItemReadWireTest` (7 tests, which failed to
  compile before the host existed) pass in QuickJS on the JVM: a bundle with one changed
  character is refused, `parseItemRead("not json")` is an `InvalidReadError`, evaluating
  before an edition is a `NoEditionError`, a label with quotes, a backslash, a newline, U+2028
  and `</script>` round-trips exactly, the edition body hashes in Kotlin to the edition id,
  every enum value passes the web app's parser, and the read fields match the TypeScript
  contract in order; `bash android/ci-local.sh` (8 tests) and the root CI mirror exit 0.

- **The rules bundle is built with the app.** Gradle task `:engine:buildEmbed` runs the web
  repo's `scripts/build-embed.sh` into `android/build/embed` (`byt-engine.js` and its
  manifest), with the engine, shared and embed sources and the script as inputs, so it reruns
  only when they change; `:engine:test` depends on it and gets the repo root and the bundle
  folder as system properties. Adds kotlinx-serialization-json 1.8.1, the Kotlin serialization
  plugin and, for tests only, Zipline 1.28.0 (QuickJS on the JVM). Source: Android plan Task 3.
  Verified: `:engine:buildEmbed` writes the bundle and manifest; `bash android/ci-local.sh`
  and the root CI mirror exit 0; Socket scores: kotlinx-serialization-json 100 on every axis,
  zipline-jvm supply chain 91, vulnerability 100.

- **Local gate and test counter.** `android/ci-local.sh` runs, each bare and stopping at the
  first failure: `:engine:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug`, then
  `count-tests.py` over both modules' reports with a floor (1 for now; raised at each merge
  point, never lowered), then `guard.sh`; its last line is "ci-local(android): all checks
  passed". `count-tests.py` is copied from Point Last Seen and changed to take several report
  folders. Source: Android plan Task 1. Verified: `bash android/ci-local.sh` exit 0
  (tests=1); the counter exits 1 on a folder with no reports and on a total under `--min`;
  the root CI mirror exit 0.

- **Lane guard with a planted-violation proof.** `android/guard.sh` walks every tracked and
  untracked (not ignored) file under `android/`, prints the count, exits 2 under 10 files, and
  fails on: `Firebase.ai(` or `generativeModel(` outside `ai/AiClient.kt` and the live device
  tests; `countTokens`; `com.google.mlkit`; the App Check debug provider outside
  `app/src/debug`; a verdict headline, a `gemini-` model name (outside the Remote Config
  defaults file) or approval wording in `app/src/main`; and any em dash, en dash or curly
  quote. Code rules read code files only, so this changelog can name the terms. The required
  footer "Not affiliated with or approved by the US Postal Service." is the one allowed use of
  "approved". Source: Android plan Task 1. Verified: the first version printed each planted
  violation but exited 0 (it set its failure flag inside a pipe's subshell); fixed with process
  substitution, then a planted `generativeModel(` exits 1 and names the file, a planted verdict
  headline, approval word and em dash each exit 1 and are named, and the clean tree exits 0;
  the root CI mirror exit 0.

- **Gradle scaffold for the native app.** Modules `:app` (Android application,
  `app.beforeyoutape.android`, minSdk 26, target 37, Compose) and `:engine` (plain Kotlin on
  the JVM, empty until the engine host lands). AGP 9.5.1, Kotlin 2.4.21, Gradle 9.9.1 with the
  same wrapper checksum as Point Last Seen (copied from there; listed in the README when it
  lands). The google-services and Crashlytics plugins apply only when an untracked
  `app/google-services.json` exists, so CI builds without Firebase config. The first screen
  carries the footer "Not affiliated with or approved by the US Postal Service." Source:
  Android plan Task 1. Verified: `AppIdTest.theAppIdIsNotTheTwaId` failed first (no Gradle
  build), then passes; `:app:assembleDebug`, `:app:lintDebug` and `:engine:test` exit 0; the
  root CI mirror exit 0.

- **Android build output and local config are ignored.** `android/.gitignore` keeps Gradle
  output, `local.properties`, `google-services.json` and keystores out of git, before any of
  them exists. The root `.gitignore` already covers `CLAUDE.local.md`, `.env*`, `*.local` and
  App Check debug token files. Source: Android plan Task 1. Verified: `git check-ignore` names
  `android/.gitignore` for `android/local.properties`, `android/app/google-services.json`,
  `android/build/x` and `android/release.jks`; the root CI mirror (edition check, lint,
  typecheck, 227 unit tests, build, tone, model guard, gitleaks, no co-author trailers) exit 0.

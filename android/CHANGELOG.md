# Android client changelog

The native Android app (`android/`). One entry per commit, newest first: what changed, its
source (plan task or finding) and how it was verified.

- **Firebase AI Logic failures are classified for the read rules.** `AiClient` wraps every
  failed call in a `ModelCallException` with the app's own kind (`AiMapping.failure`): a server
  error, quota (429), timeout or network error is transient and retried once; a blocked prompt,
  blocked content or a stopped response is a refusal and never retried; the three on-device
  exceptions are device failures; anything else (for example App Check refused or a bad key) is
  not retried. Cancellation passes through. Source: Android plan Task 7, design section 5.4.
  Verified: `AiMappingTest.everyFailureKindMaps` failed to compile first, then passes for the
  server, quota, timeout, unknown-host and I/O errors, blocked content, a missing permission, a
  bad key and an unrelated exception (the SDK's exceptions are built by reflection: their
  constructors are internal to Kotlin); `bash android/ci-local.sh` and the root CI mirror
  exit 0.

- **Item reader with the device guard and one cloud retry.** `ItemReader.read` checks the
  on-device model's status immediately before every read and picks the route from it and the
  cloud state. A blocked read says why (no model and no consent, offline, or cloud paused) and
  makes no call. A device-only read uses `ONLY_ON_DEVICE` and discards a reply whose source is
  the cloud. A hybrid failure other than a refusal is retried once in the cloud, and only if the
  cloud is still allowed at that moment; a network error, 429 or 5xx on a cloud read is retried
  once. A refusal is never retried, and three in a row pause the run until it is reset. Every
  reply goes through the web app's parser; a missing object or a parser rejection is
  "unreadable" and nothing is added. The failure kinds (`CallFailure`) are the app's own, so
  the reader needs no Firebase classes. The plan's reasons gained `CLOUD_ERROR` (a cloud failure
  such as a refused App Check token) and a `REFUSALS_PAUSED` block. Source: Android plan Task 7,
  design sections 5.3 and 5.4. Verified: `ItemReaderTest` (10 tests, which failed to compile
  first) passes: nothing is called with no model and no consent, only `ONLY_ON_DEVICE` is used
  with a model and no consent, a device-only reply from the cloud is discarded, the gate is
  read before every call, the retry rules, the refusal pause and the parser check; `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **Read routes that never send a photo without consent.** `ReadRoutes.choose` is the design
  table's four rows: a ready on-device model with the cloud allowed is hybrid, without it
  device-only; no model is cloud-only or blocked. `cloudAllowed` is true only with consent given,
  online and `kill_cloud` off; unanswered consent counts as not given. Source: Android plan
  Task 7, design section 5.3. Verified: `ReadRoutesTest` (3 tests, which failed to compile
  first) passes; `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Gate G-A0 re-run on the reviewed bridge.** The bridge's review fixes (every box item
  checked before the engine judges it, an exact `structuredClone` stand-in, stricter bundle
  checks) were merged into this branch; the bundle is now 48,234 bytes with SHA-256
  `84fd82ae...`. All 20 box, 64 guard and 21 destination vectors still pass in QuickJS, and
  `docs/evidence/android/G-A0.md` records the new bundle. Source: review of the bridge pull
  request. Verified: `bash android/ci-local.sh` (27 tests) and the root CI mirror exit 0.

- **One client for every Firebase AI Logic call.** `AiClient` is the only file that calls
  `Firebase.ai(` and `generativeModel(` (the lane guard enforces it): Gemini Developer API
  backend, limited-use App Check tokens behind Remote Config, the model name and on-device
  model option from Remote Config, and `generateObject` with the `LabelRead` schema over one
  content holding the crop image and the prompt text. A read that could reach the cloud refuses
  to start (`CloudPausedException`) while `kill_cloud` is on or no cloud model is set.
  `deviceStatus()` maps `checkStatus()` and passes cancellation through. `AiMapping` holds the
  pure translations (status, mode, source, model option, read); `Models.kt` the app's own
  types; `CropImage` is what a read may send: the cropped pixels only. Not yet run against the
  project: the Android app is not registered in Firebase, so the live cloud read test waits.
  Source: Android plan Task 6. Verified: `AiMappingTest` (4 tests, which failed to compile
  before the code existed) passes: every SDK status, mode, source and model-option string maps,
  and a null object is a null read; `bash android/ci-local.sh` (27 tests) and the root CI
  mirror exit 0.

- **Label read type generated for Firebase AI Logic.** `LabelRead` is a `@Generable` data
  class with the web app's 16 item-read fields in the same order, no `@Guide` text and no
  defaults; `toWire()` gives the engine's `ItemReadWire`. On-device and hybrid modes need such
  a class for structured output (a manual schema works only for cloud-only reads). Adds KSP
  2.3.14, `firebase-ai-ksp-processor` 17.0.0, the Firebase BoM 35.2.0, `firebase-ai` 18.2.0
  and `firebase-ai-ondevice` 16.0.0-beta08. Finding: for enums from the `:engine` module the
  processor listed `Companion` as a 38th category (a `@Serializable` enum carries a Companion
  object), so a model could have answered "Companion"; the engine's enums are no longer marked
  `@Serializable` (kotlinx serializes enums by name without it) and the generated schema now
  holds exactly the wire values. Source: Android plan Task 6. Verified:
  `LabelReadWireTest.everyPropertyMapsToTheWireFieldOfTheSameName` and
  `theEnumsAreTheWireEnums` failed first (no class, then the Companion value), then pass; the
  engine's 13 tests still pass; `bash android/ci-local.sh` (23 tests) and the root CI mirror
  exit 0.

- **Remote Config values with safe defaults.** `RcValues.parse` reads the in-app defaults
  (`res/xml/remote_config_defaults.xml`) with any fetched values on top: `cloud_model_item`,
  `kill_cloud`, `use_limited_use_tokens`, `minimum_version_android` (a version string, as in
  the web template, compared part by part), `ondevice_model_option_android` (stable, preview
  or preview_fast; anything else reads as stable), and the rules edition and second-look keys
  for later tasks. The model name lives only in Remote Config or that XML file; a missing one
  reads as empty and makes no cloud call. Firebase itself is not wired yet: the Android app is
  not registered in the project. Source: Android plan Task 4 (the parts that need no
  registration); the plan's numeric minimum version was changed to the template's string.
  Verified: `RcValuesTest` (5) and `RcDefaultsTest` (2) failed to compile before `RcValues`
  existed, then pass, including every parsed key having an XML default (both ways) and the
  shared keys keeping the web template's defaults; `bash android/ci-local.sh` and the root CI
  mirror exit 0.

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

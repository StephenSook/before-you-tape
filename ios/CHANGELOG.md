# iPhone client changelog

Each entry: what changed, its source, and how it was verified (with the exit code of
`bash ios/scripts/ci-local-ios.sh`).

## 2026-11-18

### feat(ios-core): route each read by availability, consent and network, with no cloud after a block
- What: `ReadRoutePolicy.decide` gives the route in the web app's words (hybrid, device_only,
  cloud_only, blocked) and a reason; a photo needs the on-device model to take an image, label
  words do not. `cloudAllowed` is the web rule (consent must be a yes, the cloud not paused,
  online; unanswered counts as no). `afterFailure`: a guardrail block or refusal never leads to
  the cloud, nor does a cancelled read; on-device unavailable, context, parse and timeout
  failures retry in the cloud only on the hybrid route; network, rate limit and server errors
  retry the cloud once; an App Check refusal goes to typed entry. `RouteRecord` writes `blocked`
  as null when there was no block and never carries label text. `Timeout.run` limits every model
  call.
- Source: iPhone client plan, task I-6; the web rule in `src/routing/policy.ts`.
- Verified: fourteen tests (the route table for both input kinds, image input, the device-only
  and cloud-only reasons, consent, kill switch and offline, blocks and refusals on every route,
  the retry rules, cancelled, the null block, the time limit) failed to compile without the
  types, then passed; `bash ios/scripts/ci-local-ios.sh` exit 0.

### feat(ios): add the guided item-read type and prompts, checked against the web schema
- What: the app links BYTCore. `ItemReadG` is the type the on-device model fills: the web app's
  16 read fields, the 37 categories and the two enums with the web wire values; `read` gives the
  wire JSON and cuts label text to 160 characters (code points, as the web parser counts).
  `Prompts` holds the photo read's instructions and prompt, word for word from
  `src/ai/prompts.ts`, including the four fixed lines.
- Source: iPhone client plan, task I-5.
- Verified: six app tests (every schema field has a twin property; every enum maps to the web
  values in order; the web parser returns the mapped read unchanged; label text cut to 160; the
  instructions and the photo prompt match the web file, read from it) failed to compile without
  the types, then passed; `bash ios/scripts/ci-local-ios.sh` exit 0.

### feat(ios-core): run the web app's rules engine in JavaScriptCore on the phone
- What: `ios/BYTCore`, a Swift package. `RulesEngine` loads the engine file built by the
  repository's own `scripts/build-embed.sh` (`byt-engine.js`, 48,417 bytes, with its SHA-256 in
  `byt-engine.sha256`) into JavaScriptCore and calls the bridge's functions through their JSON
  envelope; an engine refusal is a typed `EngineError`, never a crash.
  `ios/scripts/check_engine_bundle.sh` rebuilds the file and fails on any byte difference, so the
  phone and the laptop run the same engine code. The local gate runs the check and the package's
  tests.
- Source: iPhone client plan, tasks I-3 and I-4 (engine as the same bundle, not a Swift twin).
- Verified: six contract tests (the bridge's exact function list and version 1; a call before an
  edition is a `NoEditionError`; `rules/edition.json` loads as `byt-65f5528fc307`; Swift's
  SHA-256 over JavaScriptCore's canonical body reproduces that id; the item-read contract; bad
  input is an engine error) failed to compile without the host, then passed. All 105 shared
  vectors pass in JavaScriptCore with the bridge test's merge rules; a mutation expecting
  "ok_to_pack" everywhere gave 96 failures. The freshness check failed on a bundle built from
  the bridge's pull request branch, then passed on the one built from main;
  `bash ios/scripts/ci-local-ios.sh` exit 0.

### build(ios): sign device builds with the team App Attest is registered for
- What: `DEVELOPMENT_TEAM` is set in `ios/project.yml`. The Firebase iOS app now carries the same
  team id, and its App Attest provider is registered, so device builds can get App Check tokens.
- Source: App Check setup for the iPhone app (Firebase app and App Attest registered in the
  console, read back).
- Verified: the project generates; app tests pass on the simulator; unsigned device build
  succeeds; `bash ios/scripts/ci-local-ios.sh` exit 0.

### build(ios): add the XcodeGen app shell with App Check, anonymous sign-in and the Ready check
- What: `ios/project.yml` (app `BYT`, bundle id `app.beforeyoutape.reader`, iOS 27.0, Swift 6,
  firebase-ios-sdk exactly 13.2.0 with seven products, camera usage text, the App Attest
  entitlement, portrait only, an app test target). `BYTApp` sets App Attest in release and the
  debug provider only in debug builds before configuring Firebase, with a persistent Firestore
  cache. `SignIn` signs in anonymously once when needed. `ModelSessionFactory` (the only file
  naming Apple's session API) reads the on-device status, including whether Apple reports image
  understanding. The Ready check says "This iPhone can check items with no network." or why
  not. `RemoteConfigValues` holds the iPhone's keys with defaults equal to
  `remoteconfig.template.json`. The local gate now generates the project, runs the app tests on
  the simulator and builds unsigned for a device.
- Source: iPhone client plan, task I-2.
- Verified: six app tests (sign-in twice, the Ready check lines, defaults equal the template
  file) failed to compile without the types, then passed; unsigned device build succeeds;
  `bash ios/scripts/ci-local-ios.sh` exit 0.

### chore(ios): add the iPhone client's files, its model guard and its local gate
- What: `ios/.gitignore` (build output, the Firebase app config, App Check debug tokens and the
  XcodeGen output stay out of git); `ios/scripts/ios_guard.py`, which fails on any import of
  Apple's other machine-learning frameworks or their recognizers under `ios/`, keeps the session
  API to `ios/BYT/AI/ModelSessionFactory.swift` and `FirebaseAI.firebaseAI` to
  `ios/BYT/AI/AIClient.swift`, reads untracked files too, and fails below a file-count floor;
  `ios/scripts/ci-local-ios.sh`, which runs the repository's CI steps in order and then the iOS
  checks, each bare.
- Source: iPhone client plan, task I-0.
- Verified: six guard tests (banned import with file and line, every banned name, the two owner
  files, look-alike names pass, zero files fails, untracked files are seen) failed with no guard,
  then passed; `bash ios/scripts/ci-local-ios.sh` exit 0.

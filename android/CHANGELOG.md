# Android client changelog

The native Android app (`android/`). One entry per commit, newest first: what changed, its
source (plan task or finding) and how it was verified.

- **An old build shows an update screen.** `RcValues.needsUpdate` was called only from tests, so raising `minimum_version_android` in Remote Config changed nothing on a phone. `BoxViewModel.needsUpdate` now follows Remote Config, and while this build's version name is older than the minimum the app shows only `UpdateScreen`: "This app needs an update.", how to install the newest version, and "Open the download page" (the releases page). Source: audit item 18. Verified: `CopyTest.anOldBuildIsToldToUpdate` (the strings, the page, and that they are in the copy list checked for dashes and a second look) and `UpdateScreenTest` on an Android 17 emulator pass; `:engine:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:compileDebugAndroidTestKotlin` pass.
- **A one-page runbook for a borrowed Gemini Nano phone.** `android/BORROWED-NANO-PHONE.md`, linked from `RELEASE.md`, gives the owner's steps (Developer options, USB debugging, Wi-Fi), what the model download needs (from the ML Kit and Firebase docs), our checks (a release APK with its SHA-256 recorded, the facts to record, three on-device label reads, one in airplane mode, screenshots of our app only), the film beats, and how the phone is given back (our app uninstalled, USB debugging revoked, no account or file left; a Gemini Nano download stays in AICore for the owner to clear). The app shows no read time, so the screen recording gives it. Source: the plan for a borrowed phone. Verified: each step names strings from `ui/Copy.kt` ("Check on this phone only", "Get the model on this phone", "Labels are read on this phone first.", "Read on this phone"); text only otherwise.
- **The judge build's release gate on the A16 is on record.** `docs/evidence/android/a16-2026-11-21/README.md` records the `android-judge` APK from main 76acd04 (SHA-256 df64d580...4f71) on the Samsung A16: the `release.sh` checks, the permissions by aapt2, the install over the earlier build (installed file matches), the `ReleaseAppCheckProbeTest` pass at 01:17:22Z (Play Integrity token, sign-in, cloud read of the known label as a power bank), one typed item added and removed in the app, and no AICore on the phone. Source: `android/RELEASE.md` asks for a record per release gate. Verified: text only; each value is from that run's output.
- **The consent choice no longer says "Keep everything on this phone".** It now reads "Check on this
  phone only": the box list still saves each item's category, battery numbers and answers to the
  account, so "everything" was not true. The web button changes the same way ("Check on this laptop
  only"), and `CopyTest` still pins the Android text to the web text with "laptop" as "phone".
  Source: review of the consent copy. Verified: the web consent test fails on the old label and
  passes; `CopyTest` runs in Android CI.

- **Android says it runs no cloud second look.** `docs/LIMITS.md` now states that Android does not run
  the cloud second look: on a phone with an on-device model, that one read and the rules decide, and
  the card says which read it was ("Read on this phone"). Two copy tests pin it: no on-screen text
  mentions a second look, and an on-device read is labelled "Read on this phone". Source: review of
  what Android claims. Verified: both tests failed against a planted copy line naming a second look,
  then pass on the real copy (`CopyTest` 7 of 7); `Copy.kt` was restored byte for byte.

- **A photo read keeps the tags of its whole label, never of the clipped text.** The box tagged a
  read's label text after the parser had clipped it to 160 characters, and the engine trusts tags
  that cover the label, so a hazard word past the cap was lost (FLAMMABLE could read "OK to pack")
  and a cut could make one (FLAMMABLE-FREE ending at FLAMMABLE). The reader now uses the tagged
  parse, `ReadOutcome.Read` carries its `labelTags`, and the box saves them; `BoxSession` no longer
  tags text itself. A typed item also takes its tags from the tagged parse. Source: review of the
  second-look change. Verified: `ItemReaderTest.aReadCarriesTheTagsTheParserGaveForItsWholeLabel`
  and `BoxSessionTest.aReadIsAddedWithTheTagsTheParserGaveForItsWholeLabel` failed to compile first
  and pass; `./gradlew :engine:test :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
  :app:compileDebugAndroidTestKotlin` exits 0 (161 unit tests, none skipped); `android/guard.sh`
  exits 0.

- **The engine host parses a read with the tags of its whole label.** `EngineHost.parseItemReadTagged`
  calls the bridge's tagged parse and returns a `TaggedRead`: the read, label text clipped to 160
  characters for showing, with the engine's tags for the whole label. Source: review of the
  second-look change (the phones tagged the clipped label text). Verified:
  `EngineHostTest.aParsedReadIsTaggedFromItsWholeLabel` (no hazard word OK; FLAMMABLE past the cap
  tagged flammable and label_text and not OK, the shown text 160 characters; FLAMMABLE-FREE cut at
  FLAMMABLE untagged and OK) failed to compile first and passes; `:engine:test` passes.

- **Every newer build installs as an update.** `versionCode` is now the HEAD commit's time in
  epoch seconds (`git log -1 --format=%ct`, read through `providers.exec`), so it rises with each
  commit; a shallow CI checkout still has its HEAD commit, and with no git the build falls back to
  1. `android/check-version-code.sh <apk>` reads the APK's versionCode with aapt2 and fails unless it
  equals the HEAD commit time; `android/release.sh` runs it on the signed file. Source: review (a
  fixed versionCode of 1 gave every build the same version). Verified: the check failed on the old
  release APK ("versionCode is 1"), passes on the rebuilt debug APK, and `android/release.sh` exits
  0 with "check-version-code: versionCode 1795128545 is the HEAD commit time"; the Android guard is
  clean.

- **The Android guard refuses speech recognition.** Rule 8 in `android/guard.sh` fails on
  `SpeechRecognizer`, `RecognizerIntent` or `RECOGNIZE_SPEECH` in any Kotlin, XML or config file
  under `android/`; the system voice (`TextToSpeech`) stays allowed. This matches the web guard,
  which refuses speech recognition and allows the system voice. Source: review of the speech rule
  change on the web side. Verified: with two untracked planted files, the guard passed before the
  rule (exit 0) and failed after it (exit 1) naming only the two recognizer lines, not the
  TextToSpeech file; with the plants removed it is clean on 125 files.

- **Android follows the Remote Config edition pin instead of always using the bundled edition.**
  The app now watches `rules_edition_id` and `rules_edition_sha256`. When they change, it reads the
  published edition at `ruleEditions/{id}` (signed in, through the deployed rules), checks it on a
  spare host with `EditionPin.choose`, and only then loads it into the rules in use, re-checks the box
  and refreshes the destination list; a notice from the check is shown as the web shows it. Each pin
  change is a new check and only the newest may apply. About shows the edition in use. With the pin
  empty, as it is today, nothing changes. Source: whole-repo review. Verified:
  `BoxLogicTest.newRulesRecheckTheBox` failed first, then passes; the live check
  `EditionPinLiveTest` passed on the emulator against the deployed project (the bundled edition
  verified on the phone's JavaScript runtime, revision 1; an unpublished edition read nothing through
  the deployed rules and the built-in edition was kept). `bash android/ci-local.sh` exits 0.

- **A Remote Config edition pin needs a safe id and a full hash, as on the web.** The pin was read
  as raw text. `RcValues.parse` now keeps it only when the id matches `[a-z0-9-]{1,64}` and the
  SHA-256 is 64 hex digits (trimmed, the hash lowercased); otherwise both are empty and the bundled
  edition is used. Source: whole-repo review. Verified:
  `RcValuesTest.anEditionPinNeedsASafeIdAndAFullHash` failed first (an uppercase hash came through
  unchanged), then passes.

- **The engine can check a pinned rules edition the way the web does.** `EditionPin.choose`
  follows the web's rules and words (`src/data/editionSource.ts`): an empty pin, or one naming the
  bundled edition, uses the bundled edition; a pinned edition is used only when the fetched
  document has exactly the pinned id and SHA-256, the rules accept it and its revision is higher than
  the one in use; anything else keeps the edition in use and says why. `EditionCheck.verify` loads a
  document into a spare host and hashes the engine's own canonical JSON, the text the publish script
  hashes. One difference from the web: Android needs the rules to parse a document before it can
  hash it, so a document that is both malformed and wrongly hashed reads "could not be read" rather
  than "failed its integrity check"; both keep the edition in use. Source: whole-repo review.
  Verified: `EditionPinTest` (8) and `EditionCheckTest` (2) failed first, then pass; with the hash
  and revision checks removed, 2 of 8 fail; the bundled edition's hash on Android equals the web's
  `sha256Hex(canonicalJson(...))` of `rules/edition.json` (checked once against the value the web
  code prints).

- **Cloud consent can be changed in the app, and turning it off stops a read under way.** The
  consent question was asked once and could not be changed afterwards. The About screen now shows
  this phone's choice ("Cloud reads: allowed", "off" or "not chosen yet") and a button: "Turn off
  cloud reads" when they are allowed, "Ask me again about cloud reads" otherwise. Turning them off
  saves the choice and cancels the read that is running, so its result is dropped and nothing more
  is sent; asking again forgets the choice so the consent question opens. Reads now run through the
  one worker helper, which returns its job, so the box is still saved in exactly one place. Source:
  whole-repo review. Verified: `LocalStoreTest.clearingTheChoiceAsksAgain`, the two new `AboutTest`
  cases and `ConsentWithdrawalCancelsTheReadTest` failed first (the last one also with the cancel
  and the active check removed, as a control), then pass; `AboutPhoneScreenTest` passed 4 of 4 on
  the emulator and failed 2 of 4 with the button choice flipped. `bash android/ci-local.sh` exits 0.

- **The cloud stays off until the server's Remote Config values are active.** Before the first
  fetch only the in-app defaults are known, and their `kill_cloud` is false, so a switch-off on the
  server could be missed by a phone that had not fetched yet. `RcStore` now treats the cloud as
  switched off until a value fetched from the server is active (Firebase reports `kill_cloud`'s
  source as remote). Activated values persist on the phone, so after the first fetch this also holds
  offline. Source: whole-repo review. Verified: `RcStoreTest.theCloudIsHeldUntilAFetchedValueIsActive`
  failed against a stub, then passes; the live check `RcFetchLiveTest` passed on the emulator against
  the deployed project (fetched=true, killCloud=false, so the cloud opens once the server values
  arrive). `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A read of no item is dropped, as on the web.** A cloud or on-device read that is unsure,
  of category `other`, with no label text, no battery, liquid or warning signal and no real name
  (a camera pointed at a room) was added to the box as an item. `NoItem.isNoItem` now applies the
  web app's own rule (`src/shared/noItem.ts`), and such a read adds nothing and shows the web's
  line, "Nothing to check there. Hold one item inside the box." Source: whole-repo review.
  Verified: `NoItemTest` (the web's own cases, and the name pattern compared with the web file
  character for character) and `BoxSessionTest.aReadOfNoItemAddsNothing` (which also checks the
  line is the web's) failed against stubs, then pass. `bash android/ci-local.sh` and the root CI
  mirror exit 0; GitHub checks are blocked by the Actions budget, so these local runs are the record.

- **Evidence for gate G-A5.** `docs/evidence/android/G-A5.md` records the parity run: on the
  emulator (Android 17), every shared vector passes in the app's runtime (box 29, guards 64,
  destinations 21) and QuickJS equals WebView V8 on 426 inputs (114 vectors, 312 labels), WebView
  145.0.7632.218, rules bundle SHA-256 52e8fb43...60b48 from a clean build of 4c64439, with both
  controls caught. The A16 run and the live same-box check are listed as not done yet, with what
  each needs. Source: Android plan Task 17. Verified: the root CI mirror and the Android mirror
  (its dash and quote guard included) exit 0.

- **QuickJS against WebView V8 on every vector and a 312-label corpus.** `EngineDifferentialTest`
  loads the same rules bundle and edition into the app's QuickJS runtime and into an
  `android.webkit.WebView` (V8, test code only), and requires byte-for-byte equal reply text for
  every box, guard and destination vector and for the label tags of every case in
  `label-corpus.json`: all 69 distinct vector label texts plus our own cases crossed with no-break
  spaces, each Unicode hyphen, full-width letters, accented neighbours, a line break inside
  "ALCOHOL FREE", "0 % alcohol" and empty text (`android/tools/label_corpus.py` builds it,
  ASCII-escaped). A difference planted on the oracle's side is reported. Source: Android plan
  Task 17 (gate G-A5). Verified: on the emulator, 426 inputs (312 labels), all equal, WebView
  145.0.7632.218, bundle SHA-256 52e8fb430508; the planted difference is caught.
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **The shared vectors run inside the app's runtime on a device.** The device-test APK now
  carries `tests/vectors` as assets (a `copyVectorAssets` build task, so it is always the same
  files the web app and the JVM tests run), and `DeviceVectorsTest` runs every box, guard and
  destination vector through the app's own bundled, manifest-checked engine on the device. A
  wrong expectation planted in one vector is reported, so the run cannot pass by checking nothing.
  Source: Android plan Task 17 (gate G-A5). Verified: on the emulator (Android 17, API 37): box 29,
  guards 64, destinations 21, all passed; the planted case is caught. `bash android/ci-local.sh`
  and the root CI mirror exit 0.

- **A typed "lists alcohol" is the sender's own word.** When the sender types an item and
  ticks that the label lists alcohol, the item now keeps it as their correction
  (`overrides.alcoholOnLabel = true`), as the web app does. With the shared engine's matching
  rule, a sender's own alcohol line settles the question like an answer of yes, so it is not
  asked again; the model's flag alone still asks. Until that engine change is in the shared
  bundle, the verdict is the same as before. Source: the web app's typed facts change. Verified:
  `BoxLogicTest.aTypedAlcoholLineIsTheSendersOwnWord` failed first (empty overrides), then
  passes; an unticked typed item keeps empty overrides. `bash android/ci-local.sh` and the root
  CI mirror exit 0.
- **A web `addedAt` survives the phone's sync.** The web app now stamps `addedAt` (ms since
  1970) on new items. The phone's item mapper dropped any field it did not know, so a phone
  write would have removed it. `addedAt` now joins the fields kept as they came and is written
  back unchanged when present; the phone does not stamp it yet. Source: the web app's item
  contract (`tests/contracts/box-docs.json` now carries `addedAt`). Verified:
  `BoxDocsContractTest.theFixtureItemDecodesAndEncodesToTheSameDocument` failed first (the
  round trip lost `addedAt`), then passes; `bash android/ci-local.sh` and the root CI mirror
  exit 0.

- **The new "ceramic" item category.** The web app adds a 38th category, `ceramic` ("Ceramic
  or porcelain (mug, plate, vase)"), just before `other`, with rules that use it. The engine's
  `ItemCategoryWire` and the typed-item form's `ReadCopy.CATEGORIES` gain it in the same place,
  so the phone can read, type and sync a ceramic item, and the shared ceramic vectors decode.
  Source: the web app's rule gaps (batch A). Verified: the contract tests that compare the
  enum order and the form labels with the web files (`ItemReadWireTest`, `CopyTest`), and the
  shared vectors (`SharedVectorsTest`, which could not decode `ceramic`), failed first and pass
  now; the enum size guard moves from 37 to 38.

- **The box repository writes through a small store, local first.** `FirestoreBoxRepository`
  now makes its writes through `DocStore` (create, set, update, delete by document path, plus
  the server time and increments), with `FirestoreDocStore` the real one. Only creating a box is
  awaited; an item, a removal, a destination or counts are sent without waiting, and Firestore's
  cache holds them while the phone is offline. Watching the box still reads Firestore directly.
  Source: Android plan Task 10 (`BoxRepositoryTest.anItemReadOfflineIsSentWhenTheLinkReturns`).
  Verified: `BoxRepositoryTest` (3 tests, against a store that queues writes offline) passes:
  an item written offline reaches the server when the link returns, with its label text empty
  and only its category name; a new box carries no consent and the server time; counts go as
  increments of only what changed. A control where `putItem` sends nothing fails the first test.
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A typed name correction never leaves the phone.** The synced item dropped the label text
  and the model's name, but a sender's typed name correction still went out in
  `overrides.itemName`. `BoxLogic.forSync` now drops `itemName` from the synced overrides too,
  and the synced read's name is the label of the corrected category when a correction changed it
  (falling back to the category id, never free text). Source: automated security review of the
  previous commit, and the web app's matching rule (typed corrections stay on the device).
  Verified: `BoxDocsContractTest.aTypedNameCorrectionNeverLeavesThePhone` (a correction to
  "Grandma's rose water" and perfume) failed first, then passes: no `itemName` in the synced
  overrides, the read named "Perfume or cologne", and the typed words nowhere in the document.
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Firestore carries no consent and no model names.** Consent is now chosen on each device
  and never stored in Firestore: the box rules refuse `cloudConsent`, `consentChosenAt` and
  `consentAt`. A new box from the phone writes none of them (`BoxDocs.newBoxDoc`); the
  `setConsent` write added just before is removed, and only an old box read back still shows a
  leftover `cloudConsent`. An item's synced read now names only its category (the form label,
  for example "Lotion or cream"): the model's name for the item stays on the phone. Source: the
  per-device consent ruling for the web and Android apps. Verified:
  `BoxDocsContractTest.aNewBoxCarriesNoConsentAtAll` and `anItemDocumentNamesOnlyTheCategory`
  failed first, then pass; the fixture round trips still pass. The deployed rules still require
  `cloudConsent` on a new box until the new rules deploy, so the live box test waits for that.
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A new box carries no consent, and consent changes carry their times.** The box rules now
  refuse a new box whose `cloudConsent` is not null, and refuse any change to `cloudConsent`
  that does not also set `consentChosenAt` (the press time) and `consentAt` (the server's time).
  The phone's `createBox` wrote the sender's consent on a new box. It now writes
  `BoxDocs.newBoxDoc` (consent null, no consent fields), and a new `setConsent` writes
  `BoxDocs.consentChange`: `cloudConsent`, `consentChosenAt` from this phone's clock, and
  `consentAt` as a server timestamp, in one update. The destination and count updates already
  leave all three alone. Source: the web app's box consent rules (batch A). Verified:
  `BoxDocsContractTest.aNewBoxHasNoConsentChosenYet` and
  `aConsentChangeCarriesThePressTimeAndTheServerTime` failed against stubs of the old behavior,
  then pass; `BoxLiveTest` passed live on the emulator against the deployed rules (a phone-made
  box with consent null is accepted and read back; a stranger is refused). `setConsent` needs the
  new rules and is not called yet. `bash android/ci-local.sh` and the root CI mirror exit 0.
- **A downloadable model starts on Wi-Fi at launch.** At launch, the first model check now
  decides once: a phone whose on-device model can be downloaded starts the download when the
  network is unmetered (Wi-Fi); on mobile data the app asks first (the existing "Get the model
  on this phone" button), and a phone with no model never downloads. A failed download says so
  once and the offer comes back to try again. Source: Android plan Task 16 (model readiness).
  Verified: `ModelReadinessTest` gains the four plan tests; `startsAtLaunch` stubbed false fails
  the Wi-Fi test, and stubbed true fails the mobile-data and no-model tests; the real rule passes
  all. The view model's launch hook itself has no unit test, and no phone available here reports
  a downloadable model (the emulator and the A16 have none), so that path is untested on a device.
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **About this phone.** A new "About this phone" button opens a screen with what reads labels
  here (one sentence per on-device model status, pinned by tests: no model, ready, can be
  downloaded, downloading, could not report), the cloud model from Remote Config, the App Check
  provider (`play_integrity` in a release build, `debug` in a debug build), the rules edition id,
  the rules bundle's commit and the first 12 characters of its SHA-256 (from the bundle's build
  manifest), the version, "License: Apache-2.0", and a link to the web app's rules page. A ready
  model says "On-device model: ready" and is never named: the SDK version in use reports no model
  name. Source: Android plan Task 16 (About part); the real-phone pass had no About screen to
  show. Verified: `AboutTest` (4 tests: every status sentence, every row, no model named, the rules
  link) failed first, then passes; the device tests `AboutPhoneScreenTest.everyRowIsShown` and
  `theHomeScreenOpensAbout` pass on the emulator, and a control with the screen's rows removed
  fails both. `bash android/ci-local.sh` and the root CI mirror exit 0.
- **Evidence: the app on a real phone.** `docs/evidence/android/a16-2026-11-18/` holds 5
  stills of the release-signed app on a Samsung A16 against the deployed project (cloud
  consent, home, destination with the camera off, the typed-item form, an "OK to pack"
  verdict), with a README that also records the release App Check probe on the same phone
  (Play Integrity token, sign-in, a cloud read of the known label). Source: the real-device
  pass. Verified: each still is cropped to remove the phone's status and navigation bars and
  was checked by eye; the root CI mirror (hygiene guard and secret scan included) exits 0.

- **A crop queued from the old scan session no longer uses up the new session's reset.** The
  reset for a new scan session was a single pending flag, taken by whichever read the worker
  started next. If a crop was accepted, waited on the worker behind a box update, and the person
  went to the box and back to the camera before it ran, that old crop took the reset; a refusal
  from it then counted in the new session. Each crop now carries the scan session that was
  current when `crop()` accepted it, and the worker resets only when it starts the first read
  from a newer session. Source: review (second model) of the Android pull request, round 3,
  finding 1. Verified: `BoxSessionTest.aQueuedCropFromTheOldSessionDoesNotUseUpTheNewSessionsReset`
  first failed (`expected:<[read, reset, read]> but was:<[reset, read, read]>`), then passes; the
  earlier session tests still pass. `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A failed model download shows a message instead of crashing the app.** The pinned SDK
  reports a failed download as a `Failed` step and then ends the flow with the exception. The
  view model collected the flow with no catch, so the exception escaped its coroutine and the
  app crashed. `ModelReadiness.collectDownload` now runs the download: a failure, as a step or
  as the exception, shows "could not download" once and never escapes, and the status is still
  checked again afterwards. Closing the screen (cancellation) still stops it and is not shown as
  a failure. Source: review (second model) of the Android pull request, round 3, finding 2.
  Verified: `ModelReadinessTest` gains three tests; the two throwing cases first failed with the
  escaped `IllegalStateException`, then pass, and the cancellation case passes. `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **An item whose read leaves out optional fields still loads.** The rules require only
  `itemName`, `category`, `labelText` and `evidence` in an item's `read`; the other twelve fields
  may be left out. The phone's decoder required all sixteen, so such an item threw
  `MissingFieldException` instead of loading. Missing fields now take the web app's form
  defaults (0 for a number, false for a flag, `cannot_tell` for the retail box) before decoding.
  Source: review (second model) of the Android pull request, round 2, finding 7. Verified:
  `BoxDocsContractTest.aReadWithOnlyTheRequiredFieldsDecodesWithTheWebsDefaults` first failed
  with that exception (twelve fields required), then passes; `bash android/ci-local.sh` and the
  root CI mirror exit 0.

- **Fractional read and re-check times survive sync and a restart.** The web app times reads
  and rules-only re-checks with `performance.now()`, so `readMs` and `lastRecheckMs` can be
  fractional (`1450.75`), and the rules accept any number. The phone kept both as whole
  numbers, so syncing an item or reloading the saved box cut `1450.75` to `1450`. Both are now
  `Double` on the phone, in the item, the box header and the saved box. The document mapper
  writes a whole value as an integer and a fractional one as a double, as the web SDK does.
  Source: review (second model) of the Android pull request, round 2, finding 6. Verified:
  `BoxDocsContractTest.fractionalTimingsSurviveARoundTrip` first failed (`expected:<1450.75> but
  was:<1450>`), then passes; `BoxPersistenceTest.aFractionalReadTimeIsKeptOnThePhone` passes;
  the existing check that a whole `readMs` stays an integer (`900`) still passes. `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **A read still running when a new scan session starts counts in the old session.** Going back to
  the camera reset the refusal count at once, on the worker. A slow read from before was still
  waiting on the model; when it returned with a refusal, that refusal counted as the first of the
  new session, so two more would pause photo reads early. `BoxSession.startNewScan` now marks the
  reset as pending, and `check` applies it just before the next read starts. Source: review
  (second model) of the Android pull request, round 2, finding 5. Verified: the updated
  `aNewScanSessionLiftsTheRefusalPause` and the new `aReadInFlightDuringANewSessionIsNotCountedInIt`
  failed first (the reset landed between the old read's start and end), then pass; `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **An older model check can no longer put a stale status back.** Every model status check wrote
  its result when it finished. If the app went to the background and back during a download, the
  resume check could finish after the post-download check and set the status back to
  "downloading", hiding the camera until the next refresh. Now `LatestCheck` lets only the most
  recently started check update the screen. While the app's own download runs, a status below
  AVAILABLE shows "downloading" (`ModelReadiness.shown`), so the download offer cannot come back
  and start a second download. When the download ends, either way, the status is checked again.
  Source: review (second model) of the Android pull request, round 2, finding 4. Verified:
  `ModelReadinessTest` (2 tests, which failed to compile first) passes; `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **A cancelled sign-in waiter can no longer start a second anonymous user.** The shared sign-in
  serialized callers with a lock, but the Firebase sign-in ran inside the caller. If that caller
  was cancelled while waiting (its screen closed), the lock was released while the Firebase
  sign-in kept running, and the next caller started a second one: the same uid race as before.
  The one anonymous sign-in now runs in an app-wide scope; every caller waits on that same
  sign-in, a cancelled waiter leaves it running, and a failed sign-in is not kept, so the next
  caller tries again. Source: review (second model) of the Android pull request, round 2, finding
  3. Verified: `SignInTest.aCancelledWaiterDoesNotStartASecondSignIn` first failed on the old
  lock (the second caller got `uid-2`), then passes; the other two sign-in tests still pass.
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **The release probe takes the cloud route on any phone.** The probe asked the phone for its
  on-device model status. On a phone with a ready model the reader chose hybrid inference, the
  phone answered on its own, and the probe (which requires a cloud read) failed though App Check
  and sign-in had worked. The probe now pins the reader's gate to "no model on the phone", so it
  always exercises the cloud route through the same reader and parser. Source: review (second
  model) of the Android pull request, round 2, finding 2. Verified: the device tests compile;
  the probe is a live release-only test and runs on the judge phone (`android/RELEASE.md`);
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **The saved box never goes back in time.** The view model saved the box in `publish`, which
  also runs on the UI thread. A UI-thread save could take an older box while the worker saved a
  newer one, then write the older one over it, so the next start restored a stale item or
  quantity. Now the box is saved in exactly one place, the worker helper `onWorker`, right after
  each change, and every box change runs there. Source: review (second model) of the Android pull
  request, round 2, finding 1 (high). Verified: `BoxSavesOnTheWorkerTest` (the one save is inside
  `onWorker`, never in `publish`) failed first, then passes. On the emulator: a typed lotion
  stepped to 3, `am force-stop`, and a cold start showed "Lotion or cream x 3", "How many: 3",
  "OK to pack". `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A written release gate: a real read on the judge path.** `android/RELEASE.md` says how to
  build the release APK and what `release.sh` checks. An APK ships only after the release probe
  passes on a real phone with the signed APK sideloaded, the way a judge installs it: a token
  from the release App Check provider, a sign-in, and a cloud read of a known label through the
  app's own reader. It also names what that depends on outside the repo: App Check's Play
  Integrity settings must accept an app Google Play does not recognize, and emulators or phones
  without the Play Store cannot pass. Source: review (second model) of the Android pull request,
  finding 2. The provider choice itself waits for that run on a real phone. Verified: the command
  in the file is the one run on the emulator today (it failed there at the App Check step, as the
  file says it must); `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A phone that can download its own model is offered it, and readiness is checked again on
  return.** The app checked the on-device model once, at start, and treated anything but
  AVAILABLE as "no model". A phone that reported DOWNLOADABLE, where the person kept everything
  on the phone, could only type, even after the model arrived.
  - Now, with consent declined, DOWNLOADABLE offers "Get the model on this phone" (the SDK's
    `OnDeviceExtension.download()`), and DOWNLOADING says the model is on its way and offers
    typing.
  - Each download step is mapped to the app's own `ModelDownload`. A finished or failed download
    re-checks the status; a failed one also says so.
  - `MainActivity.onResume` re-checks the model's status, and `HomeUi` carries that status
    instead of a yes or no.

  Source: review (second model) of the Android pull request, finding 4. Verified:
  `AiMappingTest.everySdkDownloadEventMapsToOurs` and two new `ConsentScreenTest` cases (the
  offer and its button; typing while it downloads) failed to compile first, then pass. The UI
  device tests pass 20 of 20 on the emulator (whose model status is UNAVAILABLE, so the
  download itself waits for a supported phone). `bash android/ci-local.sh` and the root CI
  mirror exit 0.

- **The release probe now proves a real read, not just a reply.** The probe passed whenever the
  App Check call and the model call returned, even when the reply could not be decoded (no read)
  and even when sign-in failed (only logged). It now runs the app's production read path: the
  app's `ItemReader` with the web app's parser from the bundled engine, the shared sign-in, and
  the cloud route. It requires an App Check token, a successful sign-in, and a read that came back
  from the cloud and parsed as the drawn power bank. Source: review (second model) of the Android
  pull request, finding 9. Verified: on the Play-image emulator with the release build (Play
  Integrity, which this device cannot pass until App Check allows a sideloaded APK), the probe
  failed at the right step: "no App Check token from the release provider on this device" (403
  App attestation failed), with sign-in ok and the read outcome Failed. `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **The box survives Android stopping the app.** The box lived only in memory, so when Android
  reclaimed the process, reopening the app kept the destination but dropped every item, fix,
  quantity and answer. `BoxPersistence` now saves the active box in app-private storage after
  every change: the items (label text included, which stays on the phone), the destination, the
  consent answer and the read counts. On start the view model restores it, and
  `BoxController.restore` re-checks it by the rules, so verdicts are recomputed, never restored.
  Nothing is saved until the restore has run, so an early change cannot overwrite the saved box.
  A damaged save starts an empty box. Source: review (second model) of the Android pull request,
  finding 6. Verified: `BoxPersistenceTest` (3) and `BoxLogicTest.aRestoredBoxIsRecheckedAtOnce`
  failed to compile first, then pass; the whole box with answers, a fix, quantity 3, a
  destination change and the web's extra fields comes back equal. On the emulator: a typed lotion
  to Canada ("OK to pack"), then `am force-stop` (the process ended), then a cold start in a new
  process showed "See the box (1)" and the lotion with "OK to pack" and "Typed by you". `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **Going back to the camera lifts a refusal pause.** Three refusals in a row pause photo reads
  for the run, but nothing ever started a new run, so after three refusals no photo could be read
  again until the app was killed. `BoxSession.startNewScan` now resets the reader's run. The view
  model calls it, on the box's worker thread, whenever the person goes back to the camera ("Add
  another item"). Source: review (second model) of the Android pull request, finding 8. Verified:
  `BoxSessionTest.aNewScanSessionLiftsTheRefusalPause` failed to compile first, then passes:
  paused before, one reset, then a read is added. `bash android/ci-local.sh` and the root CI
  mirror exit 0.

- **A slow read no longer closes a form the person is filling in.** When a read finished, the
  screen always switched to the box, even if the person had meanwhile opened "Type it" and was
  entering another item, which threw that draft away. `HomeNav.afterCheck` now shows the box only
  if the person is still on the camera; otherwise they stay where they are. A failed read also
  keeps them in place and says why. Source: review (second model) of the Android pull request,
  finding 7. Verified: `HomeNavTest` (3 tests, which failed to compile first) passes: a read on
  the camera shows the box; a read while typing leaves the form open; a failed read stays put
  with its message. `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Fast quantity taps add up instead of overwriting each other.** Each card sent an absolute
  quantity (the shown number plus or minus one). Two fast taps on "One more" before the card
  redrew both sent 2, so the engine judged two phones when the sender meant three. A tap now
  sends a step (1 or -1), applied to the current quantity on the box's worker thread, in order,
  and kept between 1 and 99. Source: review (second model) of the Android pull request, finding
  5. Verified: `OverridesTest.quantityStepsAddUpAndStayBetweenOneAndNinetyNine` failed to
  compile first, then passes (two steps from 1 give 3; one fewer stops at 1; one more stops at
  99). `HomeScreenTest.theQuantityStepsUpAndCannotGoBelowOne` now taps twice and records two
  steps; it passes on the emulator (8 of 8). `bash android/ci-local.sh` and the root CI mirror
  exit 0.

- **One shared sign-in, so two anonymous users can never race.** App start launched its own
  anonymous sign-in without waiting, and a cloud read (or a box write) could start a second one
  through `FirebaseSignIn` at the same time. Whichever finished last became the user, so a
  request could go out as a different uid from the one the app held: the box rules refused a box
  created that way. `SignIn` now serializes every call behind one lock, so callers that arrive
  together share a single sign-in. App start, cloud reads and box writes all use the same
  `FirebaseSignIn`. Source: a live box test against the deployed rules (a box create was refused
  while the app's own start-up sign-in was still running). Verified: `SignInTest` (2 tests, which
  failed to compile first) passes: three concurrent callers share one sign-in and the same uid,
  and a signed-in user is returned with no new sign-in. `bash android/ci-local.sh` and the root
  CI mirror exit 0.

- **A release build cannot ship without the Firebase configuration.** The build applies the
  Google Services plugin only when `app/google-services.json` exists (CI has none), so a release
  build from a checkout without the file used to succeed with no Firebase app, and so no AI
  client. Any release assemble, bundle or package task now fails without it, naming the file.
  `release.sh` also checks the exact signed APK for the `google_app_id` resource. The resource
  dump goes to a file first: `grep -q` stops at its first match, and under `pipefail` the dump's
  SIGPIPE read as a failure. Source: review (second model) of the Android pull request, finding
  1. Verified: the new `android/release-config.test.sh` (local only) failed first (the release
  build passed without the file), then passes. Without the file the release build fails with the
  message; with it, the build passes. `bash android/release.sh` exit 0 with "Firebase
  configuration: present", 0 scan hits and 16 KB alignment exit 0. `bash android/ci-local.sh`
  and the root CI mirror exit 0.
- **A box lists its items in the order they were added.** The web app is adding an optional
  `addedAt` to item documents (ms since 1970), because the server returns items by their random
  ids and cards reshuffled after a reload. The phone now keeps an `addedAt` it reads on every
  write back, and lists a box oldest first by `addedAt`, with undated items last in the order the
  server gave them (`BoxDocs.sortedForListing`, used by the repository's watch). The phone does
  not stamp `addedAt` on its own items yet: the deployed rules refuse item fields they do not
  list, so stamping waits until the web change and its rules are deployed. Source: the web
  builder's contract change for item order. Verified: `BoxDocsContractTest.anAddedAtFromTheWebIsKept`
  and `aListedBoxIsSortedByAddedAtWithUndatedItemsLast` failed first, then pass (7 contract
  tests); `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A Firestore box repository, local first.** `FirestoreBoxRepository` creates a box (its owner
  as the only member, no join key, zero counts; awaited, because items need the box to exist).
  It writes and removes items, sets the destination with the time of the rules-only re-check,
  adds to the read counts, and watches the box and its items as one stream. Every write except
  the creation is sent without waiting, and the Firestore cache holds it while the phone is
  offline. Adds `firebase-firestore` (Firebase BoM). Source: Android plan Task 10. Verified:
  `BoxLiveTest` (live, on request) passed on the emulator against the deployed rules. A box made
  on the phone was read back with its owner as the only member. An item written with the network
  off reached the server once the network returned, with empty label text and quantity 1. A
  destination change was accepted. A stranger (a new anonymous user) was refused the box
  (PERMISSION_DENIED). `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Box and item documents that match the web app's.** `BoxDocs` turns a box item into the web
  app's item document and back, and the box header likewise, as Firestore values. The shapes
  come from `tests/contracts/box-docs.json`, the fixture the web app and the Firestore rules are
  checked against.
  - An item document never carries label text: the read's `labelText` is empty and a typed label
    is dropped from the overrides; the tags travel instead.
  - `quantity` and `readMs` are written as whole numbers, since the rules require an integer
    quantity.
  - The web app's item fields this phone does not use (`secondLook`, `readFallback`, `cropKey`,
    `customs`) are kept on the item (`BoxItem.extras`), so syncing never drops them.
  - A phone-made item carries the web app's defaults for them (no second look, no crop key,
    empty customs).
  - An unknown read source from the web is kept as it is.

  Source: Android plan Task 10. Verified: `BoxDocsContractTest` (5 tests, which failed to
  compile first) passes. The fixture item and box decode and encode back to the same documents,
  with quantity as a whole number. A local item with read and typed label text gives a document
  with neither. `cloud_unreported` and the web's extra fields survive a round trip. A phone item
  carries the default fields. `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Unit tests re-run when a web file they read changes.** The engine and app unit tests read
  web repo files that were not declared inputs of their Gradle tasks: the built bundle, the
  shared vectors and the rule edition (engine), and the consent sentence, form labels, prompt,
  crop limits, Remote Config template and box contract (app). After a change to one of those
  files, Gradle kept the old test result. That is how a merge of main showed green locally
  while the same commit failed in CI (`RcDefaultsTest`). Both test tasks now declare those
  files. Source: the false green found by the first CI run of the Android job. Verified: before
  the change, editing `remoteconfig.template.json` left `:app:testDebugUnitTest` UP-TO-DATE.
  After it, an unchanged tree keeps both tasks UP-TO-DATE, and editing the template and a
  vector file re-runs both. `bash android/ci-local.sh` and the root CI mirror exit 0.

- **The phone's second-look policy default matches the web template's.** The web Remote Config
  template gained the second-look policy, the rule edition id and its hash. The phone's
  defaults had the two edition keys equal and the policy empty, while the template's default is
  `{"whMismatch":true,"batteryNumbers":true,"notSure":true,"hazardNoLabel":true,"identity":true}`.
  The phone now ships that value. `RcDefaultsTest` now lets the set of shared keys grow, as long
  as the first three are there and every shared key equals the template's default. Source: a
  fresh run after merging main (a false green: Gradle had kept the earlier test result because
  the template is not a declared input of the test task; the next entry fixes that). Verified:
  the test failed on exactly this value (expected the policy JSON, was empty), then passes; `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **The local Android gate holds a floor of 90 unit tests and compiles the device tests.**
  `android/ci-local.sh` raises its floor from 1 to 90 (92 tests now, rounded down to a ten, at
  this merge point; the floor is never lowered) and compiles the device tests too, matching the
  new CI workflow. Source: Android plan Task 15. Verified: `bash android/ci-local.sh` exit 0
  (92 tests, guard clean); the root CI mirror exit 0.

- **The APK scanner reads its tokens without putting them on a command line.** `scan-apk.sh`
  passed the Keychain debug tokens to its Python step as arguments, where any local process
  could read them during a scan. The Python step now reads them from the Keychain itself, and
  only the Keychain service names are arguments. Source: automated security review of the
  scanner commit. Verified: a new `scan-apk.test.sh` check (no token array passed as
  arguments) failed first, then passes, with the three earlier checks still passing on real
  builds; the release APK scans clean (583 entries, 0 hits); `bash android/ci-local.sh` and the
  root CI mirror exit 0.

- **One script builds and checks the release APK.** `android/release.sh` reads the keystore
  password from the Keychain into the build process only, and builds without the configuration
  cache. It prints the signing certificate, scans the exact signed file with `scan-apk.sh`, and
  requires `zipalign -c -P 16` to pass, so the QuickJS native libraries suit 16 KB memory
  pages. Its last line names the APK. Source: Android plan Task 14. Verified: `bash
  android/release.sh` exit 0; certificate SHA-256 `7d672af6...6ada` (the registered one); scan
  583 entries, 0 hits; zipalign 16 KB check exit 0; last line `release APK:
  app/build/outputs/apk/release/app-release.apk`; `bash android/ci-local.sh` and the root CI
  mirror exit 0. The phone check (G-A4) waits for the App Check provider decision and the A16.

- **Every release APK is scanned for App Check debug secrets.** `android/scan-apk.sh` (ported
  from the PLS app, with this app's Keychain token names) checks the raw bytes of every entry
  (UTF-8 and UTF-16), the decoded resource table and the dex. It reports any debug token, a
  filled `firebase_app_check_debug_token` resource, the debug provider class or
  `FIREBASE_APPCHECK_DEBUG_TOKEN`, and prints no token. Exit 0 means clean, 1 means a hit, 2
  means the scan could not run. Source: Android plan Task 14. Verified: `android/scan-apk.test.sh`
  (local only, since it needs the Keychain token) failed first with no scanner (exit 127). It
  now passes on real builds: the debug APK is refused, naming the token resource and the debug
  provider; the release APK is clean; a missing file exits 2. `bash android/ci-local.sh` and
  the root CI mirror exit 0.

- **A quantity stepper on each item.** Each card in the box shows "How many: n" with "One fewer"
  and "One more" buttons. One fewer is off at 1 and one more is off at 99, matching the box's
  1 to 99 rule, and the box re-checks after each step. The web app keeps the same field
  (`setQuantity` in its store) but has no control for it yet; the phone shows the number, so
  a person sending three phones can say so. Source: review (wired-or-cut for `setQuantity`).
  Verified: `HomeScreenTest.theQuantityStepsUpAndCannotGoBelowOne`, which failed to compile
  first, passes on the emulator with the other UI tests (18 of 18); `bash android/ci-local.sh`
  and the root CI mirror exit 0.

- **The app runs end to end: destination, consent, camera or typing, rules, box.**
  - `BoxViewModel` holds the box and runs every box change on one worker thread. It loads the
    bundled rules (hash-checked) and their destinations, and keeps consent and destination in
    the phone's local store.
  - It reads crops through `ItemReader`: the device model's status before each read; the cloud
    only with consent, a connection and kill_cloud off; and a Firebase sign-in first
    (`FirebaseSignIn`).
  - Typed items go through the web app's own read parser, then into the box. A fix saves only
    the fields that changed, and a corrected label brings its new tags.
  - After a successful read it shows the box. If the rules fail to load, it shows the
    rules-not-loaded line and no verdict.
  - `MainActivity` draws `HomeScreen` with the real camera screen. The manifest adds
    `ACCESS_NETWORK_STATE`.

  Source: Android plan Task 9 (and Task 12's typing and fixing). Verified on the Play-image
  emulator with the debug build:
  - Launch shows the destination picker and the consent question.
  - After "Allow" and Canada, "Check now" on the emulator's camera scene read in the cloud.
    The read said "unknown", and the engine answered "Check this" ("Confirm what this is. We only
    saw it, ..."), with "Read in the cloud, from this phone".
  - "Type it" with "Lotion or cream" and label words gave the engine's "OK to pack", marked
    "Typed by you".
  - Switching to the Philippines re-checked the box by rules alone. The lotion became "Take it
    out" with the engine's reason, as the shared vector `lotion_ph` expects.
  - No crash.

  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **The read with the sender's fixes applied.** `BoxLogic.effectiveRead` applies each
  override to the read, so "Fix this reading" opens the form at what the sender last saw. An
  override the read type cannot take (typed text in a number field) is left out of the form;
  the engine still judges it. Source: Android plan Task 12. Verified: two `OverridesTest`
  cases (a number and a category applied, an untakeable value left out), which failed to
  compile first, pass; `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Home screen: destination, consent, camera or typing, and the box.** `HomeScreen` is
  stateless, drawn from `HomeUi`, with every action going through `HomeActions`. It shows where
  the box is going (a picker over the edition's destinations), then the consent question once.
  After that it shows the camera, or "Choose where the box is going first" until a destination
  is set. With consent declined and no model on the phone, it shows the blocked line and "Type
  it". Typing opens the item form, and the box view shows each item with "Fix this reading" and
  "Remove". A fix opens the form at the current reading. Status lines are a polite live region.
  `ItemCard` and `PackScreen` gain the fix, remove and bottom slots. Source: Android plan Task 9
  (home screen) and Task 12 (typing and fixing). Verified: `HomeScreenTest` (7 tests, which
  failed to compile first) passes on the emulator with a stand-in camera, together with the
  pack, consent and form tests (17 of 17); `bash android/ci-local.sh` and the root CI mirror
  exit 0.

- **Typed items, fixes, quantity and removal in the box, each re-checked.** `BoxLogic` and
  `BoxController` gain `addManual` (a typed item, read source "manual", identity confirmed by
  the sender), `override` (corrected fields kept as overrides on the read; a corrected label
  brings its own tags), `setQuantity` (rounded and kept between 1 and 99, as the web app does,
  so zero becomes 1) and `remove`. The box re-checks after each. `forSync` now also drops a typed
  label from the overrides, as the web app's stored copy does, so no label text leaves the phone.
  Source: Android plan Task 12. The plan's "a quantity of zero is checked, not accepted" became
  the web app's 1 to 99 clamp, for parity. Verified: `OverridesTest` (6 tests, which failed to
  compile first) passes, and putting `forSync` back to keeping the typed label fails
  `aTypedLabelStaysOffTheSyncedItemToo`; `bash android/ci-local.sh` and the root CI mirror exit 0.

- **An item form drawn from the shared item-read contract (commit 56b0c9c).** `ReadForm` shows
  what the web form shows: name, what it is (37 categories), the words on the label, the four
  numbers, the seven yes-or-no facts and the box. An empty number means not printed. A negative
  or non-number value marks its field and blocks Save, and Save also waits for a category.
  `ReadDrafts` holds the web form's rules. A typed item with label words counts as a label read;
  otherwise the item is only seen. A typed item with no name takes its category's name. A fix
  saves only the fields that changed. `ReadCopy` holds the web form's own words. Source: Android
  plan Task 12. Verified: `ReadDraftTest` (6), `CopyTest.everyContractFieldHasALabel` (fails
  when `src/shared/itemRead.ts` grows a field with no label; `evidence` is the one derived
  field) and `CopyTest.theFormLabelsAreTheWebFormsLabels` (numbers, flags, box, headings and
  categories equal `src/ui/ReadFields.tsx` and `src/ui/categoryLabels.ts`) failed to compile
  first, then pass. `ReadFormTest` (3) passes on the emulator: every field kind has a control; a
  negative number blocks Save; a chosen category and a typed number are saved. `bash
  android/ci-local.sh` and the root CI mirror exit 0. This entry came in a follow-up commit,
  because the commit's own changelog edit failed.

- **One "Check now" from crop to box.** `BoxSession` sends a crop to the reader. A read is
  added to the box with the engine's tags for its label text and a fresh item id, and the box
  re-checks itself. A blocked or failed read adds nothing and returns the one line that says
  why. Source: Android plan Task 9. Verified: `BoxSessionTest` (4 tests, which failed to compile
  first) passes: a cloud read lands with its tags, its source ("phone_cloud") and its time; an
  offline block and an unreadable label each add nothing and return their line; two reads get
  two ids and are counted as on-device reads; `bash android/ci-local.sh` and the root CI mirror
  exit 0.

- **The phone remembers its cloud consent and last destination.** `LocalStore` keeps the
  consent choice per device (never synced) and the last destination code in app-private shared
  preferences. Until a choice is made the consent is unanswered, and an unreadable stored value
  also counts as unanswered, so nothing can read as consent by accident. Label text and crops
  are not kept there. Source: Android plan Task 9 ("Consent is stored on the phone, per
  device"). Verified: `LocalStoreTest` (4 tests, which failed to compile first) passes;
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A device test can run against the release build, to probe its App Check provider.**
  `-Pbyt.testBuildType=release` runs the device tests against the release build type, with its
  App Check provider and release signing; every other run tests debug. `ReleaseAppCheckProbeTest`
  (live) skips on debug. On a release build it asks for a limited-use App Check token, signs in,
  and makes one cloud read of a drawn battery label, which App Check enforcement accepts only with
  a valid token. It logs BYT-PROBE lines with each outcome and error text, never a token. Source:
  review of the judge path for a sideloaded APK on an emulator. Verified: with the release
  provider switched (locally, not committed) to reCAPTCHA Enterprise at threshold 0.5, the probe
  ran on a Play-image and a plain AOSP emulator: the reCAPTCHA client produced a token on both,
  the exchange returned "403 App attestation failed", and the cloud read was refused ("Firebase
  App Check token is invalid"); `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Release builds are signed with the release key.** The keystore lives outside the repo
  (`byt.release.storeFile` in the untracked `local.properties`, default
  `~/.byt-keys/byt-android-release.jks`, alias `byt-android`). Its password comes from the macOS
  Keychain into `BYT_RELEASE_PASSWORD` for one build, and the build refuses to sign with the
  configuration cache on, so the password is never written to a cache. Without the password,
  the release build stays unsigned, as in CI. Release minify stays off. Source: Android plan
  Task 14. Verified: `assembleRelease` with the password gave `app-release.apk`, whose
  certificate SHA-256 is `7d672af6...6ada` (the one registered with Firebase); without it,
  `app-release-unsigned.apk`; `bash android/ci-local.sh` and the root CI mirror exit 0.

- **A read that can reach the cloud signs in first.** Cloud AI Logic requests can be required
  to carry a Firebase Auth ID token, and the app's start-up sign-in is not awaited, so a read
  could reach the cloud before it finished. `ItemReader` now takes a `signIn` step (no default,
  so the app must pass a real one) and awaits it before a hybrid or cloud-only read. If sign-in
  fails, a ready model on the phone reads alone, and with none nothing is sent (a retryable
  "check did not go through"). The device-only route never waits for it. Source: review of
  the AI Logic authenticated-users setting. Verified: `aCloudOnlyReadSignsInBeforeTheModelCall`
  (order: sign-in, then the cloud call), `aFailedSignInWithNoModelOnThePhoneSendsNothing`,
  `aFailedSignInWithAModelOnThePhoneReadsOnThePhoneOnly` and `theDeviceOnlyRouteNeverSignsIn`
  failed to compile first, then pass; `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Every read sends the web app's system lines and read prompt.** `Prompts` holds the web
  app's item-read system lines and prompt (`src/ai/prompts.ts`) word for word, and `AiClient`
  now builds its model with the system lines as `systemInstruction`, as the web app does. The
  shared bundle takes these over in bridge v2. Source: Android plan Task 9 (reads on the judged
  path) and review of parity with the web app. Verified: `PromptsTest` (3 tests, which failed to
  compile first) passes: the five system lines and the prompt equal the literals parsed out of
  `src/ai/prompts.ts`, and the one `generativeModel(` call carries the system lines; the live
  cloud read on the emulator with the web prompt answered from the cloud in 2,409 ms with
  category power_bank, 18.5 Wh and evidence label_read; `bash android/ci-local.sh` and the
  root CI mirror exit 0.

- **Camera screen with a hold zone, a photo picker and a typed way in.** `CameraScreen` asks
  for the camera once and shows the preview with the hold zone drawn on it (4 wide by 3 tall,
  80% of the width, centred; `holdZoneFor` gives the same fractions for the drawing and the
  cut). "Check now" takes one picture with CameraX 1.6.2's `LifecycleCameraController`. The
  frame is cut to the capture's crop rectangle (the preview's viewport), turned upright by its
  rotation, cut to the zone and scaled to the shared 768 px limit, and the full frame is
  recycled at once (`Upright`). CameraX hands the buffer over unrotated, and `toBitmap()`
  ignores the crop rectangle, both read in the 1.6.2 sources, so both steps are applied here.
  "Add a photo" uses the system photo picker (no permission), decodes the photo upright
  (`PhotoDecode`: ImageDecoder from Android 9, EXIF orientation before that) and cuts it to the
  zone's shape around its centre. "Type it" is always shown. With the camera denied, the screen
  says so and offers the picker and typing. "Check now" waits while a read runs. The manifest
  asks for `CAMERA` and marks the camera optional. Source: Android plan Task 8. Verified:
  `UprightTest` (4) and `CameraScreenTest` (3), which failed to compile first, pass on the
  emulator: a quarter turn puts a red-left buffer red-on-top before the zone is cut and the
  frame is recycled; the crop rectangle is applied before the turn; a 2000x1000 zone becomes
  768x384; a picked 3000x4000 photo becomes 4:3 with a 768 px long side; denied shows the
  camera-off line with a working picker and typing and no "Check now"; granted shows the zone
  and a working "Check now"; busy holds it. Two new `CropTest` cases pin the zone's shape and
  centring, portrait and landscape, and an aspect mutation fails both. `bash
  android/ci-local.sh` and the root CI mirror exit 0. Socket has no record of these CameraX
  artifacts (Google Maven, not Maven Central); they are the official AndroidX artifacts, and
  the sources jars read were camera-view dfb710c6d7b0, camera-core 9803a0c47248 and
  camera-lifecycle 573cdf43f258 (SHA-256 prefixes).

- **Consent before any photo leaves the phone.** `ConsentScreen` asks once, with the consent
  sentence and its two choices. Declining with a model on the phone says labels are read on
  this phone only. Declining with no model on the phone says nothing can read a label here
  without the user's OK, and offers "Type it". Source: Android plan Task 9. Verified:
  `ConsentScreenTest` (3 tests, which failed to compile first) passes on the emulator: both
  choices show and "Allow" reports true; declining with no model shows the blocked line and a
  working "Type it", and "Allow" is gone; declining with a model shows the on-phone line;
  `bash android/ci-local.sh` and the root CI mirror exit 0. Storing the choice on the phone
  comes with the local store.

- **Pack screen with verdicts, reasons and questions.** `PackScreen` shows one `ItemCard` per
  item, then the box's lithium line, its notes and the footer that disclaims the Postal Service.
  Each card shows the item's name, the engine's own headline and first reason, where the read
  ran (`Copy.source`: on this phone, in the cloud from this phone, on the laptop, in the cloud
  from the laptop, typed by you, or route not reported), and the engine's question with its
  answers as chips. The card writes no verdict words. With no engine result the screen shows
  only the line that says nothing is checked yet. Adds Compose ui-test (and espresso-core
  3.7.0, since the version Compose pulls in calls an InputManager API removed in Android 37) for
  device tests. Source: Android plan Task 9. Verified: `PackScreenTest` (4 tests, which failed
  to compile first) passes on the emulator against the real bundled engine, with the shared
  vector's three phones: item a's card shows the engine's headline, first reason, question,
  every answer and its source; tapping an answer stores it and re-checks the box exactly once;
  the footer shows; with an engine error only the rules-not-loaded line shows; `bash
  android/ci-local.sh` and the root CI mirror exit 0.

- **The app's words, in one place.** `Copy` holds the consent sentence (the web app's, with
  "laptop" changed to "phone" and nothing else), its two choices, the footer that disclaims the
  Postal Service, the action labels, and one plain line for each blocked or failed read (no
  model and no consent, offline, cloud paused, refusals paused; unreadable, refused, a device
  read that came from the cloud, a device or cloud error). Verdict words are not here: they come
  from the rules engine. Source: Android plan Task 9. Verified: `CopyTest` (3 tests, which
  failed to compile first) passes: the consent sentence and both choices are checked against
  `src/ui/ConsentNotice.tsx` itself, the footer is exact, and no line uses a dash or a curly
  quote (the test writes those characters as escapes so its own source stays ASCII);
  `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Box logic that re-checks by rules alone.** `BoxState` holds the box on the phone;
  `BoxLogic` changes it without calling a model (add a read with where it ran, answer a
  question, set the destination, take a result or an engine error, and the synced form of an
  item, which drops the label text and keeps its tags); `BoxController` re-checks the whole box
  through the engine after every change, always with the current destination. A country change
  is a rules-only re-check and is counted. When the engine fails, no verdict is shown and the
  error is kept. Source: Android plan Task 9. Verified: `BoxLogicTest` (6 tests, which failed
  to compile first) passes: a read is added with "phone_on_device" and re-checked; a country
  change re-checks with the new code and no model call; a read added after a country change
  uses the new country; an answer re-checks with the answer; the synced item has no label text
  but keeps its tags; with the engine failing there is no verdict; `bash android/ci-local.sh`
  and the root CI mirror exit 0.

- **The rules bundle runs in QuickJS inside the app.** `QuickJsRuntime` runs Zipline's
  QuickJS on one dedicated thread (a QuickJS context must stay on the thread that made it), and
  `EngineAssets` loads `assets/engine/byt-engine.js` with its build manifest and the bundled
  rules edition into an `EngineHost`, which refuses a bundle whose SHA-256 differs from the
  manifest. A Gradle task (`copyEngineAssets`, after `:engine:buildEmbed`) puts the bundle, the
  manifest and `rules/edition.json` into the app's generated assets. Adds Zipline 1.28.0 to the
  app (QuickJS for arm64-v8a, armeabi-v7a, x86 and x86_64). Source: Android plan Task 9.
  Verified: `EngineOnDeviceTest` (2 tests, which failed to compile first) passes on the
  emulator: the asset bundle loads, gives the edition id from `edition.json` and tags a battery
  label, and a wrong expected hash is refused as `BundleMismatch`; the debug APK holds the three
  assets and the four QuickJS libraries; `bash android/ci-local.sh` and the root CI mirror
  exit 0.

- **Crop math that keeps only the hold zone.** `Crop.zoneRect` turns the hold zone (fractions
  of the upright frame) into pixels clipped to the frame; `scaleToMaxSide` brings the longest
  side down to the shared limit and never enlarges; `centerToAspect` cuts a picked photo to the
  zone's shape, centred. `CropLimits` are the web app's own numbers from
  `src/shared/cropLimits.ts` (768 px longest side, JPEG quality 0.85, 500,000 bytes); the plan's
  1024 px was an estimate made before that file existed. App unit tests now get the repo root as
  a system property. Source: Android plan Task 8. Verified: `CropTest` (6 tests, which failed to
  compile first) passes, including a 4000x3000 frame with zone 0.1/0.3/0.8/0.4 giving 3200x1200
  at 400,900, 3200x1200 scaled to 768x288, a small crop left as it is, and the limits read from
  the TypeScript file; `bash android/ci-local.sh` and the root CI mirror exit 0.

- **Ledger: the emulator's App Check debug token.** One debug token for the debug build on
  this Mac's emulator is registered for the Android app; its value is only in the macOS Keychain
  (`byt-appcheck-debug-android-emulator`) and the gitignored `local.properties`, never printed,
  and never in CI, a release APK or the A16. Source: Android plan Task 4. Verified: the Firebase
  CLI registration exited 0 and the live App Check test on the emulator passes; the root CI
  mirror exit 0.

- **Gate G-A0 recorded for the merged bridge.** After the bridge pull request merged (three
  review rounds, ten fixes), the bundle is 48,417 bytes, SHA-256 `9887f1fa...`, rebuilt on a
  clean tree (`dirty: false`); all 20 box, 64 guard and 21 destination vectors still pass in
  QuickJS. `docs/evidence/android/G-A0.md` records it. Source: the bridge pull request's merge.
  Verified: `:engine:buildEmbed` and `:engine:test` rerun (13 of 13); the root CI mirror exit 0.

- **Live App Check and cloud-read checks, run only on request.** Tests marked `@Live` call the
  live project and are left out of the default device run (`notAnnotation`). Run them with
  `-Pandroid.testInstrumentationRunnerArguments.annotation=app.beforeyoutape.android.live.Live
  -Pandroid.testInstrumentationRunnerArguments.notAnnotation=androidx.test.filters.FlakyTest`.
  `AppCheckLiveTest` checks that the debug build's registered debug token gets an App Check
  token and that sign-in gives a user id (nothing is printed). `AiLogicLiveTest` sends one
  cloud read of a drawn "Li-ion 3.7V 5000mAh 18.5Wh" label through `AiClient` with the in-app
  Remote Config defaults and checks that it answers from the cloud with a read. Source: Android
  plan Tasks 4 and 6; and the check that the Android API key, now restricted to this package and
  its two signing certificates, still answers. Verified: on the emulator against
  `before-you-tape-2026`, 2 of 2 pass; the read came back in the cloud in 3,541 ms as a power
  bank with battery words (local evidence, not in the repo); `bash android/ci-local.sh` and the
  root CI mirror exit 0.

- **Live Remote Config store with safe defaults.** `RcStore` publishes `RcValues` from a
  `RcSource`; the Firebase source sets the in-app defaults XML, fetches at start and listens in
  real time, and keeps the last activated values if an update fails. Until the defaults or a
  fetch load, the map is empty, so no cloud model is set and no cloud read can start. Adds
  `firebase-config` from the BoM. Source: Android plan Task 4. Verified: `RcStoreTest` (2 tests,
  which failed to compile first) passes: nothing loaded means no cloud model, and a live update
  (kill_cloud on) is published; `bash android/ci-local.sh` (44 tests) and the root CI mirror
  exit 0.

- **App Check and anonymous sign-in before any Firebase call.** `BytApp` installs the App
  Check provider first, then signs in anonymously, and does nothing when the build has no
  Firebase config. Debug builds use the App Check debug provider (`app/src/debug`), with the
  token from the untracked `local.properties` (`byt.appcheck.debugToken`, or
  `byt.appcheck.debugToken.a16` with `-Pbyt.device=a16`); release builds use Play Integrity
  (`app/src/release`) and carry no debug provider or token. Adds `firebase-appcheck-
  playintegrity`, `firebase-appcheck-debug` (debug only) and `firebase-auth` from the BoM.
  Source: Android plan Task 4. Verified: `AppCheckSetupTest.theDebugBuildUsesTheDebugProvider`
  failed to compile first, then passes; debug and release both assemble; the lane guard keeps
  the debug provider inside `app/src/debug`; `bash android/ci-local.sh` (42 tests) and the root
  CI mirror exit 0.

- **Ledger: the release certificate and Play Integrity are registered.** The release
  certificate's SHA-256 is on the Firebase Android app (SHA id `c7055e329b4b2a52`), and the
  Play Integrity App Check provider is registered for it (token TTL 3600 s, minimum device
  recognition NO_INTEGRITY, the default). App Check is not enforced for the Android app until
  a real release APK passes with a Play Integrity token. Still pending and Stephen's: the Play
  Console app, linking the Cloud project under App integrity, and the setting that recognizes
  installs from outside Google Play. Source: the Android app's Firebase registration. Verified:
  both read back in Firebase when they were set; the root CI mirror exit 0.

- **The Android app's Firebase config and release key are in the secrets ledger.**
  `docs/secrets-ledger.md` gains three rows: the Android Firebase config (app id
  `1:481254717481:android:d6d36d3b475193c2740438`, on the build machine only and gitignored),
  the release keystore (outside the repo, its password in the macOS Keychain; the certificate's
  public SHA-256 is listed), and App Check for the Android app (Play Integrity, pending). No
  secret value is written. Source: the Android app's registration in Firebase. Verified: the
  config file holds that app id and package and `git status` shows it ignored; the keystore's
  fingerprint was read back with keytool; the root CI mirror exit 0.

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

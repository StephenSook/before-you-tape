# App Privacy answers: Before You Tape (iPhone)

The answers for App Store Connect > App Privacy, from what the iPhone app's code sends and from the
privacy manifests inside the built app (`find BYT.app -name '*.xcprivacy'`). The account holder
answers the questionnaire; this page is the evidence for each answer. It must match the public
privacy page (https://before-you-tape-2026.web.app/privacy/).

## Tracking

No. The app has no ads, no advertising identifier (IDFA) and no data broker. No Firebase library
in the app declares tracking (`NSPrivacyTracking` is false in every bundled manifest). The App
Tracking Transparency prompt is not needed.

## Data collected

| Apple data type | Collected | Linked to the user | Used for tracking | Purpose | Where it comes from |
|---|---|---|---|---|---|
| Identifiers > User ID | Yes | Yes | No | App Functionality | Firebase Authentication signs in anonymously at start (`ios/BYT/Data/SignIn.swift`). The Auth manifest declares it the same way. |
| Identifiers > Device ID | Yes | No | No | App Functionality | The random installation ID (Firebase Installations) that Remote Config receives on every settings fetch (note 5). |
| User Content > Photos or Videos | Yes, only after the sender taps Allow | Yes (see note 1) | No | App Functionality | The label crop, sent to Gemini through Firebase AI Logic for a cloud check (`CloudRunner`, `ios/BYT/AI/ModelSessionFactory.swift`), including a second look of a crop the iPhone already read (`AppModel.runSecondLook`), which also runs only after Allow. |
| User Content > Other User Content | Yes, only after the sender taps Allow | Yes (see note 1) | No | App Functionality | Label words the sender types, or scans with the keyboard's Scan Text, sent for a cloud check in place of the crop. A cloud request carries the crop or the words, never both (`ios/BYTCore/Sources/BYTCore/CloudOutbound.swift`). |
| Diagnostics > Other Diagnostic Data | Yes | No | No | Analytics | Declared by the bundled manifests of FirebaseAuth, Firestore (with its networking libraries), Installations and Remote Config (Firebase's own SDK health data). See note 5 for what Remote Config receives. |

Not collected: contact info, health, financial info, precise location, coarse location (note 5),
sensitive info, contacts, emails or messages, audio, gameplay, browsing or search history,
purchases, usage data (no analytics events), crash data (no Crashlytics in the iPhone app),
performance data (no Firebase Performance), and other data. Nothing in the box leaves the iPhone
(note 3).

## Notes

1. **Linked or not linked.** A cloud check is made by the anonymously signed-in user, with that
   sign-in's token, so the request can be tied to the anonymous user ID. Before You Tape does not
   keep the crop or the words. Answering "linked" is the cautious choice. Firebase AI Logic's
   monitoring is on for metrics (request counts, latency, errors and tokens, kept 6 weeks), and the
   project's log sink excludes AI Logic prompts and responses, so the crop and the words are not
   stored (0 such log entries in the 30 days read on 2026-11-21). If that exclusion is ever
   removed, these answers and the privacy page change the same day.
2. **Firebase Performance and Functions.** Both were linked and never called, and Performance
   collected by itself once linked. Both are removed (PR #127), so there is no Performance Data
   or Coarse Location row, and the built app has no Performance or Functions bundle.
3. **The box.** The iPhone app keeps its box on the phone (`Application Support/boxes`). If the
   box sync lands later, add User Content > Other User Content for the saved box (linked, App
   Functionality), and send the category name, never the read name, as the web and Android apps
   do. That folder is in the sender's own iPhone backup (iCloud Backup, if they use it). That is the
   sender's own Apple service, not data Before You Tape collects, so it adds no row here; the public
   privacy page says an iPhone backup can keep a copy.
4. **The app's own privacy manifest.** `ios/BYT/PrivacyInfo.xcprivacy` (PR #127) declares the
   app's use of UserDefaults (reason CA92.1, the box ID and the cloud choice) and file metadata (reason C617.1, the saved
   box's size), and the three data types the app's own use sends: the two of a cloud check and the
   Device ID (note 5); a test reads it from the app bundle. The answers on this page are the same
   as that file.
5. **Settings (Remote Config).** To pick the app's settings, Remote Config receives a random
   installation ID (Firebase Installations), the app's version, the language, the country and time
   zone settings and the system version, as the public privacy page says (item 5). Firebase's own
   disclosure page lists the same for Remote Config
   (https://firebase.google.com/docs/ios/app-store-data-collection). The bundled Remote Config and
   Installations manifests declare this as Other Diagnostic Data, not linked, for Analytics, the
   row above. No location row: the country is the iPhone's region setting, not a location the app
   finds (the app has no Location Services). The installation ID is declared as Identifiers >
   Device ID, not linked, App Functionality, in the table and in the app's own manifest. It is made
   for this install of the app, not a device-level ID such as the advertising identifier, and
   neither Firebase's disclosure page nor the Installations manifest classifies it; Remote Config
   needs it on every fetch, so it is declared rather than left out. "Not linked": the app's own
   code never reads the installation ID or keeps it with the anonymous user ID (no use of it in
   `ios/BYT` or `ios/BYTCore`; Firebase's libraries handle it).

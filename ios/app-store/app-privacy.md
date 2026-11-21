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
| User Content > Photos or Videos | Yes, only after the sender taps Allow | Yes (see note 1) | No | App Functionality | The label crop, sent to Gemini through Firebase AI Logic for a cloud check (`CloudRunner`, `ios/BYT/AI/ModelSessionFactory.swift`). |
| User Content > Other User Content | Yes, only after the sender taps Allow | Yes (see note 1) | No | App Functionality | The label's words, sent with the crop, or typed words sent for a cloud check. |
| Diagnostics > Other Diagnostic Data | Yes | No | No | Analytics | Declared by the bundled manifests of FirebaseAuth, Firestore, Installations, Remote Config and GoogleDataTransport (Firebase's own SDK health data). |

If Firebase Performance Monitoring stays in the app (see note 2), add:

| Apple data type | Collected | Linked to the user | Used for tracking | Purpose | Where it comes from |
|---|---|---|---|---|---|
| Diagnostics > Performance Data | Yes | No | No | App Functionality | App launch time, network request times, CPU and memory use (Firebase's disclosure for FirebasePerformance). |
| Location > Coarse Location | Yes | No | No | Analytics | Firebase Performance collects the IP address "to provide geography-based segmentation". |

Not collected: contact info, health, financial info, precise location, sensitive info, contacts,
emails or messages, audio, gameplay, browsing or search history, purchases, usage data (no
analytics events), crash data (no Crashlytics in the iPhone app), device ID, and other data.

## Notes

1. **Linked or not linked.** A cloud check is made by the anonymously signed-in user, with that
   sign-in's token, so the request can be tied to the anonymous user ID. Before You Tape does not
   keep the crop or the words. Answering "linked" is the cautious choice. If AI monitoring is on
   for Firebase AI Logic in the Firebase console, sampled prompts (the crop and the words) and
   answers are kept in the project's logs; check that setting before answering.
2. **Firebase Performance and Functions.** Both are linked in `ios/project.yml` but no code calls
   them. Performance still collects by itself once linked; Functions collects only when a
   function is called, which never happens. Removing both drops the two extra rows above and item
   6 of the privacy page.
3. **The box.** The iPhone app keeps its box on the phone (`Application Support/boxes`). If the
   box sync lands later, add User Content > Other User Content for the saved box (linked, App
   Functionality), and send the category name, never the read name, as the web and Android apps
   do.
4. **The app's own privacy manifest.** The app needs `ios/BYT/PrivacyInfo.xcprivacy` declaring
   its own use of UserDefaults (reason CA92.1, the box ID) and file metadata (reason C617.1, the
   saved box's size), or the upload is refused.

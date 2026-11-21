# App Review notes: Before You Tape (iPhone)

The section below goes in App Store Connect > App Review Information > Notes. Contact name, phone
and email for the reviewer are entered in App Store Connect by the account holder, not here. No
demo account is needed.

## Notes for the reviewer

1. Screen recording (attached, 70 s): build 1 of this version on an iPhone 17 Pro with iOS 27.2.1, from the Home Screen: the app opens on Ready check, then labels are read on the iPhone. The photo library thumbnails are blurred for privacy. Build 2 changes only the rule edition (revision 4) and build number. An earlier build on the same iPhone also read 22 labels on the iPhone in airplane mode (11 minutes, on request).

2. Purpose and audience: people in the US who mail gifts and personal items abroad with USPS. Batteries, liquids, sprays and flammable items have rules that differ by item and by country. You photograph an item's label, the app reads it, and a rules engine bundled with the app says OK to pack, Check this or Take it out, with the rule behind it. The model only reads the label. The rules decide every verdict.

3. Setup: no account, no login and no demo account; the app signs in anonymously by itself. No real items or box are needed: Check an item > Add a photo works with any photo of a product label.
- Open the app. Ready check says whether this iPhone reads label photos on the device.
- Tap Check an item. Hold a label (a lotion, a perfume or a power bank) inside the white frame and tap Check now, or tap Add a photo.
- The line under the photo gives the item, its verdict and where it was read.
- Tap Your box to see each item and why. Under What we checked, each rule layer shows the date it was checked. The country picker checks the whole box again by the rules alone.
With Apple Intelligence on, photos and typed label words are read on the iPhone, also in airplane mode, and nothing goes to the cloud unless cloud checks are allowed. Once they are, a photo the iPhone read can be checked again in the cloud when the rules ask, and the item says why. If the cloud question was never answered, that item shows Check it in the cloud, which asks first. Without Apple Intelligence, the app asks once, before any cloud check, whether a cropped photo or the typed label words may go to Google's Gemini. Allow sends the cropped photo, or typed words (never both), and the line ends "Read in the cloud." Keep everything on this iPhone sends nothing; Your box > Type it adds an item by hand. Only the part of the photo inside the white frame is read or sent. On Ready check, Delete everything on this iPhone deletes the box, the cloud choice and the anonymous sign-in, after asking.

4. External services:
- Apple Foundation Models: reads labels on the iPhone.
- Firebase AI Logic with Google Gemini: the cloud check, only after Allow.
- Firebase Authentication: an anonymous sign-in.
- Firebase App Check with App Attest: the cloud calls are accepted only from this app.
- Firebase Remote Config: settings such as the cloud model and a switch that pauses all cloud calls.
- Cloud Firestore: reads a newer rule edition only when Remote Config names one; none is named now.
The rules engine and the rule edition are bundled in the app. No payments, ads or user accounts.

5. Regional differences: available in every country and region except France and China mainland. France: the TLS library in the Firebase SDK is exempt from export documentation everywhere but France. China mainland: cloud checks use generative AI, which there needs filings this app does not have. Reading on the iPhone needs Apple Intelligence, which only some iPhones, languages and regions support; elsewhere a photo needs the cloud check, asked first. The rules are the same in every region. Destinations in this edition: Canada and the Philippines. USPS stops taking mail to Canada on November 29, 2026; a Canada box says so before that day and from it says nothing can go. Pick the Philippines to see items marked OK to pack.

6. Regulated material: none. The rules come from USPS's public International Mail Manual and service alerts. The app gives guidance, not legal or customs advice, and mails nothing. Not affiliated with or approved by the US Postal Service.

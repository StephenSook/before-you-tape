# Privacy

Before You Tape checks the items you plan to mail abroad with USPS before you tape the box. This
page says what stays on your device, what can leave it and when, and how to delete it. It covers
the web app, the iPhone app and the Android app.

Last updated: [date of publishing].

## What stays on your device

- The rules run on your device.
- A photo or the words on a label are read on your device when it has a built-in model: Apple's
  on-device model on iPhone, Gemini Nano on Android, and the browser's built-in model on the web.
- The photo and the full label text are never saved anywhere but your device.

## What can leave your device, and when

1. **Cloud checks, only if you allow them.** When your device cannot read an item, the app asks
   first. Only after you tap Allow, the part of the photo inside the frame and the words on its
   label go to Google's Gemini through Firebase AI Logic, to read the item. Google handles them
   under the [Gemini API terms](https://ai.google.dev/gemini-api/terms). You can turn cloud checks
   off at any time; after that nothing more is sent. Firebase records how many cloud checks run and
   how long they take, for up to six weeks, without the photo or the words.
2. **An anonymous sign-in.** The app signs in to Firebase Authentication with no name, email or
   phone number. This gives it a random user ID. Firebase uses it so that only you, and phones you
   add, can read and change your saved box, and so that cloud checks are allowed.
3. **App Check.** So that only the real app can use its services, the app sends Firebase App
   Check proof with its requests: Apple's App Attest on iPhone, Google Play Integrity on Android,
   and reCAPTCHA Enterprise on the web. This proof holds nothing you typed or photographed.
4. **Your saved box list, on the web and on Android.** Your box list is saved in Cloud Firestore,
   so it is still there after a reload and can be opened on a phone you add. For each item it
   holds the kind of item (its category, which is also saved as its name; the name read from the
   label stays on your device), how many, its battery numbers, the yes-or-no facts the read found
   (for example liquid or flammable), your answers, the rule words found on its label, and whether
   it was read on the device or in the cloud. It never holds the photo, the label text or a name
   you typed: the database rules refuse any item that carries label text. The iPhone app keeps its
   box on the iPhone only.
5. **Settings and rules.** The app downloads its settings (Firebase Remote Config) and the
   published rule editions. To pick the settings, Remote Config receives your country code,
   language, time zone and operating system version.
6. **Performance data, iPhone app only.** The iPhone app includes Firebase Performance
   Monitoring. It sends how long the app takes to start, how long its network requests take, its
   CPU and memory use, information about the device, iOS and app version, and your IP address,
   which Firebase uses to group results by region.

## What we do not do

- No ads.
- We do not sell your data or share it for ads.
- No tracking across other apps or websites, and no analytics SDK.

## How to delete it

- Remove an item from your box, and its saved copy is deleted.
- iPhone: the box lives in the app, and deleting the app deletes it. The anonymous sign-in can
  stay in the iPhone's keychain after the app is deleted.
- To delete a whole saved box or your anonymous sign-in from Firebase, open an issue at
  [github.com/StephenSook/before-you-tape/issues](https://github.com/StephenSook/before-you-tape/issues). Don't post your box link or any personal details in the issue; we will
  reply there and say how to find the box.
- The photo and words from a cloud check are not kept by Before You Tape.

## Contact

Open an issue at [github.com/StephenSook/before-you-tape/issues](https://github.com/StephenSook/before-you-tape/issues). Don't post personal details in an issue.

Not affiliated with or approved by the US Postal Service.

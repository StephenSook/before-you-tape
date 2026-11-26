# Privacy

Before You Tape checks the items you plan to mail abroad with USPS before you tape the box. This
page says what stays on your device, what can leave it and when, and how to delete it. It covers
the web app, the iPhone app and the Android app.

Last updated: November 26, 2026.

## What stays on your device

- The rules run on your device.
- A photo or the words on a label are read on your device when it has a built-in model that can
  read them: Apple's on-device model on iPhone, Gemini Nano on Android, and the browser's built-in
  model on the web.
- Before You Tape saves the photo and the full label text only on your device.
- On the web, after your first visit your browser keeps a copy of this app's own files, so the page
  can open with no connection. That copy holds no photo or label text of yours and no answer from the
  cloud.

## What can leave your device, and when

1. **Cloud checks, only if you allow them.** The app asks first. Only after you tap Allow, the
   cropped part of the photo goes to Google's Gemini through Firebase AI Logic, to read the item.
   On iPhone, label words you type or scan can go instead of the photo. Once you have allowed cloud
   checks, a photo your device already read can also be checked again in the cloud when the rules
   ask for a second look, for example to read a battery's numbers again. Google handles them under
   the [Gemini API terms](https://ai.google.dev/gemini-api/terms). Our project pays for this
   service, so under those terms Google does not use them to improve its products. It logs them
   only for a limited time, to detect and prevent misuse and to meet legal duties. You can turn cloud checks off at any time.
   After that, nothing more is sent. Firebase records how many cloud checks run, how long they
   take, their errors and their token counts, for up to six weeks, without the photo or the words.
2. **An anonymous sign-in.** The app signs in to Firebase Authentication with no name, email or
   phone number. This gives it a random user ID. Firebase uses it so that only you can read and
   change your saved box on the web, and so that cloud checks are allowed.
3. **App Check.** So that only the real app can use its services, the app sends Firebase App
   Check proof with its requests: Apple's App Attest on iPhone, Google Play Integrity on Android,
   and reCAPTCHA Enterprise on the web. This proof holds nothing you typed or photographed.
   reCAPTCHA looks at your browser and device, and Google's
   [Privacy Policy](https://policies.google.com/privacy) and
   [Terms of Service](https://policies.google.com/terms) apply to it.
4. **Your saved box list, on the web.** Your box list is saved in Cloud Firestore, so it is still
   there after a reload. The box holds your random user ID, your destination country and the rule
   edition. For each item it holds the kind of item, which is also saved as its name (the name
   read from the label stays on your device), how many, its battery numbers, the Wh and lithium-grams figures its label names (numbers only), the yes-or-no facts
   the read found (for example liquid or flammable), your answers, the rule words found on its
   label, whether it was read on the device or in the cloud, how long the reads took, and any
   verdict you report as wrong. It never holds the photo, the label text or a name you typed: the
   app removes them before saving, and the database rules refuse any item whose label text field
   is not empty. The iPhone and Android apps keep their box on the phone only. We publish totals
   across all saved boxes, such as how many items were read on the device or in the cloud and how
   long reads took. We never publish anything about one box.
5. **Settings and rules.** The app downloads its settings (Firebase Remote Config) and the
   published rule editions. To pick the settings, Remote Config receives a random installation
   ID, the app's version and your language. The phone apps also send your country and time zone
   settings and the system version.
6. **A timing record of each read, on the web and Android.** Each time the app asks a model to
   read an item, on your device or in the cloud, it sends Firebase Performance Monitoring a
   record: whether the read ran on the device or in the cloud, the model, whether it worked, and
   how long it took. A read that is tried again sends a record for each try. The record never holds the photo, the label text, your answers or your box.
   With it, Performance Monitoring receives a random installation ID, general device information
   (such as the device or browser type, the system version, network type and language) and your IP
   address, which it uses to work out your country. On the web it also receives the address of the
   page open when the record goes out, without anything after a question mark. The app makes
   records only on its Pack and sample box pages, but the first one can go out a few seconds later,
   so it can carry the address of a page you opened next. On Android it also receives a random session ID, the app version, memory and mobile
   carrier, and records how long the app takes to start and how smoothly its screens draw.
   Performance Monitoring keeps records linked to an IP address for 30 days and the rest for 60
   days. The iPhone app sends no such records.
7. **Error reports, on the web.** When the web app hits an error it did not expect, it sends
   Firebase Crashlytics a report: the kind of error, where in the app's own code it happened, a
   Firebase error code or HTTP status when there is one, the app's version, a random session ID and a
   random installation ID (the same one Remote Config receives). The session ID is kept for the browser
   tab, so reports after a reload in that tab carry the same one, and the first report under a new
   session ID also sends a session record with the same IDs. The error's message is removed in your browser before anything is sent, and so is anything after a
   question mark in a page address, so a report holds no photo, label text, item name, answer or
   box. A visit with no such error sends no report, and one page sends at most five. With a report,
   Google's servers receive your browser's user-agent string and your IP address. Reports are kept
   in our project's Cloud Logging for 30 days. The iPhone and Android apps send no error reports.

Like any online service, Google's servers see your IP address with each request.

## What we do not do

- No ads.
- We do not sell your data or share it for ads.
- No tracking across other apps or websites, and no analytics SDK. Performance Monitoring (item 6)
  records how reads perform, not what you check, and Crashlytics (item 7) records errors, not what
  you check. Google's libraries send their own diagnostics,
  such as versions, errors and timings.

## How to delete it

- Remove an item from your box, and its saved copy is deleted.
- iPhone: the box lives in the app, and deleting the app deletes it. An iPhone backup can keep a
  copy until that backup is deleted. The anonymous sign-in can stay in the iPhone's keychain after
  the app is deleted.
- Android: the box lives in the app, and deleting the app deletes it.
- On the web, a saved box lasts about 30 days. After that the anonymous sign-in may be removed, and
  the box is deleted automatically within a few days.
- On the web, press Delete my saved box under Your box. It deletes every item, the box and your
  anonymous sign-in. If the sign-in can't be deleted right away, Firebase may delete it automatically
  any time after it is 30 days old.
- The photo and words from a cloud check are not kept by Before You Tape.
- Timing records (item 6) hold no photo, words or box, so they cannot be found by your box and
  deleted one by one. Performance Monitoring removes them after 30 or 60 days, as above.
- Error reports (item 7) hold no photo, words or box either, so they cannot be found by your box and
  deleted one by one. They are removed after 30 days.

## Contact

Open an issue at [github.com/StephenSook/before-you-tape/issues](https://github.com/StephenSook/before-you-tape/issues). Don't post personal details in an issue.

Not affiliated with or approved by the US Postal Service.

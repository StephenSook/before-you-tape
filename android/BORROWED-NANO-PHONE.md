# One session on a borrowed Gemini Nano phone

Use this page to prove the Android app's on-device label read on a phone that has Gemini Nano, in one visit. The
phone belongs to someone else, so give it back as it came. The phone must be on ML Kit's Gemini Nano list for the
Prompt API (for example a Pixel 10 or 11). Our own test phone has no AICore, the Android service that runs on-device
models, so this read has never run on a phone.

## 1. The owner does these steps (their phone, their keystrokes)

1. Turn on Developer options: Settings > About phone > tap **Build number** seven times (on some phones it is under
   Software information), then enter the phone's PIN.
2. Turn on **USB debugging** in Settings > Developer options. Plug the phone into the Mac and tap **Allow** on
   "Allow USB debugging?". Leave "Always allow from this computer" off.
3. Connect the phone to Wi-Fi. The app starts the model download by itself only on Wi-Fi.
4. Keep the phone unlocked. Android runs the on-device model only for the app on screen.

What the model download needs, from the ML Kit and Firebase docs:
- AICore keeps one copy of the model for every app on the phone. If another app already got it, it is ready at once.
- A phone that was just set up or reset may need a few minutes to a few hours before AICore can download. A restart
  can make it faster. A phone with an unlocked bootloader cannot run it.

## 2. Our checks (about 20 minutes)

1. Install the release APK: the `android-judge` release file (check its SHA-256 against the release page), or one
   built from main with `bash android/release.sh`. Use a release build only. A debug build carries a debug secret.

   ```
   adb devices -l    # one phone; use its serial below
   adb -s <serial> install <the release APK>
   ```

2. Record the facts into `docs/evidence/android-nano/<phone>-<date>/facts.txt`: the APK's SHA-256 and the commit it
   was built from, and the output of:

   ```
   adb -s <serial> shell getprop ro.product.model
   adb -s <serial> shell getprop ro.build.version.release
   adb -s <serial> shell dumpsys package com.google.android.aicore | grep versionName
   adb -s <serial> shell dumpsys package app.beforeyoutape.android | grep versionCode
   ```

3. Open **Before You Tape**. On the cloud question, choose **Check on this phone only**. If the app then offers
   **Get the model on this phone**, tap it. Open **About this phone** and wait for "Labels are read on this phone
   first."
4. On-device read, three times. Choose a destination, tap **Add a photo**, allow the camera for this app, and
   photograph a power bank label. The item must say "Read on this phone". The app shows no read time yet, so the
   screen recording gives the time.
5. Airplane mode. The owner turns on airplane mode (adb still works over the cable). Repeat step 4 once. It must
   again say "Read on this phone". The owner then turns airplane mode off.
6. Screenshots of our app only, saved straight to the Mac. Before you commit one, check that no notification of the
   owner shows in it.

   ```
   adb -s <serial> exec-out screencap -p > docs/evidence/android-nano/<phone>-<date>/read-1.png
   ```

## 3. Film beats (Stephen films the phone's screen)

1. About this phone with "Labels are read on this phone first."
2. The label photo, then the item with "Read on this phone".
3. The airplane icon in the status bar, then the same read with the same line.

## 4. Give the phone back as it came

1. `adb -s <serial> uninstall app.beforeyoutape.android` (and any other package we installed). This also removes the
   camera permission we allowed.
2. The owner turns airplane mode off, taps **Revoke USB debugging authorizations**, turns USB debugging off, and
   turns Developer options off.
3. We add no account, change no other setting, and leave no file on the phone. The screenshots go straight to the
   Mac.
4. One thing stays: if our session downloaded Gemini Nano, AICore keeps it for every app on the phone. Only the owner
   can remove it, by clearing AICore's data. Tell the owner.

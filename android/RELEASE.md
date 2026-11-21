# Releasing the Android app

## Build

```sh
bash android/release.sh
```

The script builds the release APK, signs it with the release key (its password comes from the
macOS Keychain into the build only), and checks the exact signed file:

- the signing certificate (SHA-256 `7d672af6...6ada`, the one registered with Firebase);
- no App Check debug secrets (`scan-apk.sh`);
- the Firebase app configuration is in it (`google_app_id`); a release build without
  `app/google-services.json` fails before it starts;
- 16 KB page alignment for the native libraries.

Its last line names the APK.

## Release gate: a real read on the judge path

An APK ships only after this check passes, on the device and in the way a judge will use it:
the signed release APK, sideloaded (not installed from Google Play), on a real phone.

```sh
ANDROID_SERIAL=<phone> BYT_RELEASE_PASSWORD="$(security find-generic-password -w -s byt-android-release)" \
  ./gradlew --no-configuration-cache -Pbyt.testBuildType=release :app:connectedReleaseAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=app.beforeyoutape.android.live.ReleaseAppCheckProbeTest \
  -Pandroid.testInstrumentationRunnerArguments.notAnnotation=androidx.test.filters.FlakyTest
```

Run it from `android/`, on a checkout of the APK's commit. `ReleaseAppCheckProbeTest` passes only
when the release App Check provider issues a token on that phone, the app signs in, and the app's
own reader returns a cloud read of a drawn power bank label that the web app's parser accepts.

The Gradle run installs its own build of the commit, which is not byte for byte the file
`release.sh` signed. So run it with `-Pandroid.injected.androidTest.leaveApksInstalledAfterRun=true`,
then probe the shipped file itself:

```sh
adb install -r <the release APK>
adb shell sha256sum "$(adb shell pm path app.beforeyoutape.android | tr -d '\r' | sed 's/package://')"
adb shell am instrument -w -e class app.beforeyoutape.android.live.ReleaseAppCheckProbeTest \
  app.beforeyoutape.android.test/androidx.test.runner.AndroidJUnitRunner
adb uninstall app.beforeyoutape.android.test
```

The SHA-256 must be the APK's own, before and after the probe. Record the phone, both hashes, the
result and the date in `docs/evidence/android/`.

What it depends on, outside this repo:

- App Check's Play Integrity settings for this app must accept an app that is not recognized by
  Google Play (a sideloaded APK reads `UNRECOGNIZED_VERSION`); by default App Check requires
  `PLAY_RECOGNIZED`.
- An emulator, or a phone without the Play Store, cannot pass Play Integrity. Judges without a
  real phone use the web app.

## The on-device read, on a borrowed phone

Our test phone has no AICore, so the on-device read needs a borrowed Gemini Nano phone for one session.
[BORROWED-NANO-PHONE.md](BORROWED-NANO-PHONE.md) lists the owner's steps, our checks and how the phone goes back.

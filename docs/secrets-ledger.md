# Secrets and controls ledger

Names, places and states only. No secret value is ever written here.

States: VERIFIED (read back from the service), PENDING (not done or not yet confirmed), NOT USED.

## Secrets

| Secret | What it opens | Owner | Where it lives | State | Checked |
|--------|---------------|-------|----------------|-------|---------|
| Firebase web config (`VITE_FB_*`) | Identifies the web app; not a secret on its own | Stephen | `.env.local` on the build machine (gitignored) | VERIFIED: browser key limited to `before-you-tape-2026.web.app`, `before-you-tape-2026.firebaseapp.com`, `localhost:5173` and `localhost:4173`, and to 27 Firebase APIs | 2026-11-18 |
| reCAPTCHA Enterprise site key (`VITE_RECAPTCHA_SITE_KEY`) | App Check attestation on the web | Stephen | `.env.local` (public value, kept beside the config) | VERIFIED: score key allowed only on the two hosting domains | 2026-11-18 |
| App Check debug token, local | Passes App Check from this Mac in development | Stephen | macOS Keychain, item `byt-appcheck-debug-local` | VERIFIED: registered in App Check, Keychain read-back matches | 2026-11-18 |
| App Check debug token, CI | Passes App Check in GitHub Actions tests | Stephen | macOS Keychain, item `byt-appcheck-debug-ci`; GitHub secret `APPCHECK_DEBUG_TOKEN_CI` | Keychain VERIFIED; GitHub secret PENDING (set with the deploy workflow) | 2026-11-18 |
| Firebase Android config (`android/app/google-services.json`) | Identifies the native Android app `app.beforeyoutape.android`, app id `1:481254717481:android:d6d36d3b475193c2740438`; not a secret on its own | Stephen | On the build machine only (gitignored by `android/.gitignore`) | VERIFIED: file holds that app id and package; `git status` shows nothing | 2026-11-18 |
| Android release keystore | Signs the native app's release APK | Stephen | `~/.byt-keys/byt-android-release.jks`, outside the repo; its password in the macOS Keychain, item `byt-android-release` | VERIFIED: created; added to the Firebase Android app as SHA id `c7055e329b4b2a52` (type SHA_256); certificate SHA-256 (public) `7D:67:2A:F6:DD:84:C0:91:4B:F0:C7:75:CD:55:52:A3:2E:D2:CC:F0:1C:CE:9A:AA:AB:79:EE:9B:3F:63:6A:DA` | 2026-11-18 |
| Deploy credential (`FIREBASE_SERVICE_ACCOUNT`) | Deploys hosting and rules from CI | Stephen | Not created yet | PENDING | 2026-11-18 |

## Controls

| Control | Setting | State | Checked |
|---------|---------|-------|---------|
| Gemini spend cap | "Before You Tape Gemini spend cap": 25 USD a month on the Gemini API (billing service AEFD-7695-64FA) for this project only, alerts at 50, 80 and 100 percent, spend cap status Configured | VERIFIED (read back through the Billing Budget API) | 2026-11-18 |
| Project budget alert | A separate 25 USD project budget | NOT USED (optional; the Gemini cap covers AI spend) | 2026-11-18 |
| App Check on Firebase AI Logic | ENFORCED at 08:08 UTC (App Check lists the service as `firebaseml.googleapis.com`) | VERIFIED: a call with no token got 401 and a call with a debug token got 200, `evidence/appcheck-control/2026-11-18T08-23-23-453Z.json` | 2026-11-18 |
| AI Logic per-user limit | Generate content requests: 20 a minute per user (default 100), set with the narrowest safety-check bypass the API accepts for a cut over 10 percent | VERIFIED: all 44 region buckets read back 20 | 2026-11-18 |
| Dependency audit | `npm audit`: 18 findings (7 moderate, 11 high). The high ones that came with `firebase` are in `@grpc/grpc-js`, which Firestore uses only under Node, not in the browser bundle; the rest are in build and test tools (vite, vitest, eslint and their glob libraries) | Recorded; browser bundle unaffected | 2026-11-18 |
| App Check for the Android app | Play Integrity provider registered for app `1:481254717481:android:d6d36d3b475193c2740438`: token TTL 3600 s, minimum device recognition NO_INTEGRITY (the default); Play Integrity and App Check APIs enabled. Not enforced for this app until a real release APK passes with a Play Integrity token | VERIFIED registered (read back); PENDING: the Play Console app, linking the Cloud project under App integrity, and the outside-Google-Play recognition setting, all Stephen's steps | 2026-11-18 |
| Anonymous sign-in | Enabled; authorized domains are the two hosting domains | VERIFIED | 2026-11-18 |
| Firestore rules | Deny all reads and writes | VERIFIED (deployed rules read back) | 2026-11-18 |

## Accounts and MFA

| Account | Controls | MFA | Checked |
|---------|----------|-----|---------|
| Google account that owns `before-you-tape-2026` and its billing | Firebase, Google Cloud, billing | PENDING: Stephen to confirm 2-Step Verification is on | 2026-11-18 |
| GitHub account that owns the repository | Code, Actions, secrets | PENDING: Stephen to confirm two-factor authentication is on | 2026-11-18 |

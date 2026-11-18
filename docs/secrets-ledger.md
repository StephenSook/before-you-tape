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
| Deploy identity (no key) | Deploys hosting, Firestore rules and indexes from `.github/workflows/deploy-live.yml` | Stephen | Workload identity pool `github-actions`, OIDC provider `before-you-tape-main` (issuer `https://token.actions.githubusercontent.com`), service account `byt-deploy@before-you-tape-2026.iam.gserviceaccount.com`; no key file exists | VERIFIED (read back): provider ACTIVE, condition `assertion.repository_id == '1462292060' && assertion.repository == 'StephenSook/before-you-tape' && assertion.ref == 'refs/heads/main'`; the account holds exactly `roles/firebasehosting.admin`, `roles/firebaserules.admin` and `roles/datastore.indexAdmin`; `roles/iam.workloadIdentityUser` on it only for the principal set of this repository; 0 user-managed keys. No Remote Config role: template publishes stay manual | 2026-11-18 |
| Web build config in CI | The deploy build's Firebase web config and reCAPTCHA site key | Stephen | GitHub Actions Variables `VITE_FB_API_KEY`, `VITE_FB_AUTH_DOMAIN`, `VITE_FB_PROJECT_ID`, `VITE_FB_APP_ID`, `VITE_RECAPTCHA_SITE_KEY` (public values, copied from `.env.local` without printing) | VERIFIED: listed by `gh variable list` | 2026-11-18 |
| Firebase iPhone app config (`GoogleService-Info.plist`) | Identifies the iPhone app: app id `1:481254717481:ios:e03a4e8a7f4ce3f7740438`, bundle id `app.beforeyoutape.reader`; its API key is not a secret on its own | Stephen | `ios/BYT/Config/GoogleService-Info.plist` on the build machine (gitignored) | VERIFIED: app listed in the project, the file's bundle id and app id read back; API key limited to bundle `app.beforeyoutape.reader` and the Firebase APIs | 2026-11-18 |

## Controls

| Control | Setting | State | Checked |
|---------|---------|-------|---------|
| Gemini spend cap | "Before You Tape Gemini spend cap": 25 USD a month on the Gemini API (billing service AEFD-7695-64FA) for this project only, alerts at 50, 80 and 100 percent, spend cap status Configured | VERIFIED (read back through the Billing Budget API) | 2026-11-18 |
| Project budget alert | A separate 25 USD project budget | NOT USED (optional; the Gemini cap covers AI spend) | 2026-11-18 |
| App Check on Firebase AI Logic | ENFORCED at 08:08 UTC (App Check lists the service as `firebaseml.googleapis.com`) | VERIFIED: a call with no token got 401 and a call with a debug token got 200, `evidence/appcheck-control/2026-11-18T08-23-23-453Z.json` | 2026-11-18 |
| AI Logic per-user limit | Generate content requests: 20 a minute per user (default 100), set with the narrowest safety-check bypass the API accepts for a cut over 10 percent | VERIFIED: all 44 region buckets read back 20 | 2026-11-18 |
| Dependency audit | `npm audit`: 18 findings (7 moderate, 11 high). The high ones that came with `firebase` are in `@grpc/grpc-js`, which Firestore uses only under Node, not in the browser bundle; the rest are in build and test tools (vite, vitest, eslint and their glob libraries) | Recorded; browser bundle unaffected | 2026-11-18 |
| App Check on the iPhone app | App Attest provider registered (token time to live 3600 s) for Apple team `Y8XVCMLQCZ`; debug provider in debug builds only | VERIFIED: registered and read back through the App Check API (`appAttestConfig`, token time to live 3600 s); a token from a real device is PENDING (first device run) | 2026-11-18 |
| Anonymous sign-in | Enabled; authorized domains are the two hosting domains | VERIFIED | 2026-11-18 |
| Firestore rules | Deny all reads and writes | VERIFIED (deployed rules read back) | 2026-11-18 |
| APIs for the deploy identity | `iam`, `iamcredentials` and `sts.googleapis.com` enabled on the project | VERIFIED | 2026-11-18 |

## Accounts and MFA

| Account | Controls | MFA | Checked |
|---------|----------|-----|---------|
| Google account that owns `before-you-tape-2026` and its billing | Firebase, Google Cloud, billing | PENDING: Stephen to confirm 2-Step Verification is on | 2026-11-18 |
| GitHub account that owns the repository | Code, Actions, secrets | PENDING: Stephen to confirm two-factor authentication is on | 2026-11-18 |

# Security

How Before You Tape uses Firebase AI Logic safely, row by row against Firebase's own
[AI Logic security checklist](https://firebase.google.com/docs/ai-logic/security-checklist), with the
date each row was read back and how anyone can check it. States: VERIFIED (read back, with evidence),
PENDING (with its plan and date), DECIDED-NO (with the reason).

Project: `before-you-tape-2026`. Backend: the Gemini Developer API (`GoogleAIBackend` in
`src/firebase/app.ts`).

## Check it yourself

A call to Firebase AI Logic with the site's public web key but no App Check token is refused, so no
model ever answers it. The key ships in every page, so take it from the site itself:

```bash
JS=$(curl -s https://before-you-tape-2026.web.app/ | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)
KEY=$(curl -s "https://before-you-tape-2026.web.app$JS" | grep -o 'AIza[0-9A-Za-z_-]\{35\}' | head -1)
curl -s -X POST \
  "https://firebasevertexai.googleapis.com/v1beta/projects/before-you-tape-2026/models/gemini-3.5-flash-lite:generateContent" \
  -H "Content-Type: application/json" -H "x-goog-api-key: $KEY" -H "Referer: https://before-you-tape-2026.web.app/" \
  -d '{"contents":[{"role":"user","parts":[{"text":"Say ok."}]}]}'
```

Expected answer: HTTP 401 with `"message": "Firebase App Check token is invalid."` The daily probe
(`scripts/probe-live.ts`, run by `.github/workflows/probe-live.yml`) makes the same call and fails if the
answer is anything else.

## Checklist

| # | Item | State | Evidence and date | How to check |
|---|---|---|---|---|
| 1 | Enforce App Check for AI Logic | VERIFIED | The App Check API reads `firebaseml.googleapis.com` (the service name App Check uses for AI Logic) as `ENFORCED` since 2026-11-18 08:08 UTC. A call with no token got 401 "Firebase App Check token is invalid." at 18:58 UTC. `evidence/appcheck-control/` has the paired 401 and 200 runs. | The command above; the daily probe |
| 1a | Web provider: reCAPTCHA Enterprise | VERIFIED | `initializeAppCheck` with `ReCaptchaEnterpriseProvider` runs before any other Firebase call (`src/firebase/app.ts`). The score key is allowed only on the two hosting domains (`docs/secrets-ledger.md`). | Read `src/firebase/app.ts` |
| 1b | iPhone provider: App Attest | PENDING | Provider registered (token lifetime 3600 s, read back through the App Check API); a token from a real device is not proven yet. Owner: the iPhone client. | `docs/secrets-ledger.md` |
| 1c | Android provider | PENDING | Provider choice and a device or emulator proof belong to the Android client. | `docs/secrets-ledger.md` |
| 1d | App Check for Firestore (not on the checklist) | PENDING | Not enforced today. Plan: enforce on the day both 1b and 1c pass, and no later than Wed 2026-11-25. Before enforcing, read the App Check request metrics where an API gives them and record the share of unverified requests. | App Check API, service `firestore.googleapis.com` |
| 2 | Replay protection (limited-use tokens) | VERIFIED | Enforced: the App Check API reads `replayProtection: ENFORCED` on `firebaseml.googleapis.com` (the AI Logic service), updated 2026-11-18 19:09:29 UTC; the console shows it under App Check. The web client asks for limited-use tokens (`getAi(true)` sets `useLimitedUseAppCheckTokens`). After enforcement, a live cloud read on the site still got 200 (`docs/evidence/live-cloud-read-2026-11-18T19-12-50-108Z.json`) and the control run got 401 without a token and 200 with a limited-use one (`evidence/appcheck-control/2026-11-18T19-10-30-937Z.json`). | `npm run appcheck:control` (needs a registered debug token); the App Check API is readable only by the project owner |
| 3 | API key application restrictions | VERIFIED | Read 2026-11-18 through the API Keys API. Browser key: referrers `https://before-you-tape-2026.web.app/*`, `https://before-you-tape-2026.firebaseapp.com/*`, `http://localhost:5173/*` and `http://localhost:4173/*`. The iOS and Android keys are restricted to their apps. | The command above with another `Referer` is refused |
| 4 | API key API allowlist | VERIFIED | Read 2026-11-18: each of the three keys allows 27 Firebase APIs, including `firebasevertexai.googleapis.com`. | API Keys API |
| 5 | Only authenticated users (anonymous sign-in counts) | VERIFIED | On since 2026-11-18 20:08:22 UTC: the AI Logic config (`projects/before-you-tape-2026/locations/global/config`) reads `trafficFilter: { templateOnly: false, firebaseAuthRequired: true }`. The app never makes a cloud-capable call before anonymous sign-in (`src/ai/authGate.ts`). After the switch, a call with App Check but no signed-in user got 401 "Request is missing required authentication credential", the same call with an anonymous user got 200 (`evidence/appcheck-control/2026-11-18T20-10-17-431Z.json`), and a real read on the live site got 200 (`docs/evidence/live-cloud-read-2026-11-18T20-08-59-883Z.json`). A call with no App Check token is still refused by App Check first. | `npm run appcheck:control` (needs a registered debug token); the config is readable only by the project owner |
| 6 | Server prompt templates | DECIDED-NO | Each cloud call is listed under "Cloud calls" below. Firebase says server prompt templates do not yet support "Hybrid or on-device inference" or "Constraining the output to a list of enums" ([best practices and considerations](https://firebase.google.com/docs/ai-logic/server-prompt-templates/best-practices-and-considerations), read 2026-11-18). Every item read is hybrid (`PREFER_ON_DEVICE` sends the same prompt to the device and to its cloud fallback), and the cloud response schema constrains fields to enums. | That page; `src/ai/firebaseModels.ts`; `src/ai/cloudSchema.ts` |
| 6a | Validate and sanitize template variables | DECIDED-NO | Follows from row 6. Model answers are still parsed against a strict schema and refused when they do not fit (`src/shared/itemRead.ts`), and label text never goes to Firestore. | `src/shared/itemRead.ts` |
| 7 | Template-only mode | DECIDED-NO | Would refuse every un-templated call, which is every call here (row 6). | Row 6 |
| 8 | AI Monitoring | VERIFIED | On: the AI Logic config (`projects/before-you-tape-2026/locations/global/config`) reads `telemetryConfig: { mode: ALL, samplingRate: 1 }`, read 2026-11-18 about 19:08 UTC. Prompts and answers are never stored: the `_Default` log sink has the exclusion `ai-logic-prompts-responses` (filter `resource.type="firebasevertexai.googleapis.com/Model"`), so label text stays out of the logs while metrics and traces still flow. | Firebase console, AI Logic monitoring; the config and the log sink are readable only by the project owner |
| 9 | Per-user rate limit (default 100 a minute) | VERIFIED | Set to 20 a minute deliberately and read back 2026-11-18 on all 44 region buckets ("Generate content requests per minute per project per user"; default 100). Reason: one sender checks items one at a time, at most about 10 reads a minute with second looks, so 20 leaves room while one user cannot use a fifth of the default. The Live API limit stays at its default; this app never calls it. | Service Usage API, `firebasevertexai.googleapis.com` quotas |
| 10 | Project quotas reviewed | VERIFIED | Read 2026-11-18: every AI Logic quota is at its default except the per-user limit in row 9 (config reads 100 a minute, config updates 10, template reads 100 and template writes 10 per region, template test runs 10). | Service Usage API |
| 11 | Budget alerts and spend cap | VERIFIED | "Before You Tape Gemini spend cap": 25 USD a month, this project only, the Gemini API only, alerts at 50, 80 and 100 percent, spend cap `CONFIGURED`. Read 2026-11-18 through the Billing Budget API. | Billing Budget API |
| 12 | Before and after `generateContent` triggers | DECIDED-NO | Not used. App Check, the per-user limit, the spend cap and `kill_cloud` cover abuse. Every reply is parsed against a strict schema on the client, and label text never leaves the device for Firestore. | `src/shared/itemRead.ts` |
| 13 | Model Armor | DECIDED-NO | Model Armor works with the Vertex AI (Agent Platform) backend. This app uses the Gemini Developer API backend. | `src/firebase/app.ts` |

## Cloud calls

Every cloud model call, all through Firebase AI Logic with App Check, all paused by `kill_cloud`:

| Call | Where | Prompt | Why |
|---|---|---|---|
| Item read, hybrid | `src/ai/itemRead.ts` (`PREFER_ON_DEVICE`) | the item-read prompt and the cropped photo | The cloud answers only when the device model cannot |
| Item read, cloud only | `src/ai/itemRead.ts` (`ONLY_IN_CLOUD`) | the same | When the browser has no on-device model and the sender allowed cloud checks |
| Fallback model | `src/ai/itemRead.ts` | the same | One try on a second model after a 500 or 503 survives the retry, or a 404 says the model is gone |
| Second look | `src/ai/secondLook.ts` | the same crop and prompt | When the policy names a reason, after an on-device read |

Descriptions for the customs form come later, through the text model, and will be added here.

### What opens a cloud call

Each call above starts only when all three hold, checked right before it:

- **Consent, as the server has it.** The sender's answer lives on the box document in Firestore. The read gets it with `getDocFromServer`, never the cache, after the tab's own writes. Only "allowed" opens the cloud. A "no", an unanswered box, an offline device or a refused read keep it closed: a hybrid read runs on the device only, and a cloud read is not made. A change needs a press time later than the stored one and the server's timestamp (`firestore.rules`), so a late, older press from another tab cannot undo a newer one. Other tabs hear a withdrawal at once and abort their work. They never take a grant from a message.
- **The pause (`kill_cloud`).** Cloud checks stay off until Remote Config has given this browser a value of its own. If nothing was ever fetched and activated (a first visit with Remote Config blocked or offline), they stay off for the visit. A value fetched and activated earlier is used until the next successful fetch or real-time update replaces it. That is how Remote Config delivers settings, and it is the accepted limit: a new pause reaches a browser on its next fetch or update, not before.
- **This page.** The page is open, online, and not withdrawn; leaving the page aborts its calls.

# An ONLY_ON_DEVICE read that reached the cloud (2026-11-19)

What was seen, in a unit test, before the app sent on-device-only requests to an unresolvable host.

## Setup

- `firebase` 13.4.0 (`@firebase/ai` 3.1.0), `getAI` with `GoogleAIBackend`, no App Check.
- The model: `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams })`, with no
  `inCloudParams` and no request options, as `createItemModels` in `src/ai/firebaseModels.ts` built it then.
  The same app also built a `PREFER_ON_DEVICE` and an `ONLY_IN_CLOUD` model on `gemini-3.5-flash-lite`.
- The environment: Vitest with jsdom. A stand-in for the browser's Prompt API on `globalThis.LanguageModel`
  whose `availability()` resolves `"available"` and whose `create()` throws. `fetch` is stubbed to record
  every request and answer with an empty candidate.
- The call: `generateContent` with a text prompt and one inline JPEG, through the app's device port.

## What happened

- `LanguageModel.availability()` was called once and answered `"available"`. `LanguageModel.create()` was
  never called.
- One request was sent: `POST https://firebasevertexai.googleapis.com/v1beta/projects/demo-byt/models/gemini-3.5-flash-lite:generateContent`.
- `generateContent` resolved, and the response's `inferenceSource` was `"in_cloud"`.

Expected: a model made with `ONLY_ON_DEVICE` sends nothing to a server.

## What the app does about it

- The device guard checks the Prompt API at call time before any on-device read.
- A device-only read whose reply says `in_cloud` is thrown away (`leak_guard` in `src/ai/itemRead.ts`).
- Since this note, the on-device-only models are built with `requestOptions.baseUrl` set to
  `https://on-device-only.invalid`, a host that cannot resolve (RFC 2606), so such a request reaches no
  server. The test `sends nothing to a real host from the on-device-only path` in
  `src/ai/firebaseModels.test.ts` saw the Google host before that change and sees none after.

## Limits

- This was seen with a stand-in Prompt API in a test, not in Chrome. Whether Chrome's real Prompt API leads the
  SDK down the same path was not checked here.
- Why the SDK chose the cloud is not known from this test alone; only the request it sent was observed.

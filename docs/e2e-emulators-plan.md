# Plan: local browser tests on the Firebase emulators

Written 2026-11-22. Status: planned, not started. It waits until after 2026-11-30, so the browser tests do not change
base in the final week before the deadline.

## Today

- `playwright test --project=local` serves a build made with the live project's settings (`.env.local`, or the
  workflow's variables) on `http://localhost:4173`.
- So every local run reaches the live Firestore database and the live Remote Config.
- A run without a registered App Check debug token fails App Check on localhost, and the live database counts each of
  its reads as a refused request.
- Since 2026-11-22 the local project refuses to start without `BYT_E2E_LIVE_PROJECT=1` and such a token
  (`scripts/e2e-live-opt-in.ts`). That stops accidental runs, but a run with the opt-in still uses the live project.
- There is no Remote Config emulator, so moving to the emulators needs more than a config switch. `tests/e2e/leaves.local.spec.ts`
  waits for a real Remote Config fetch.

## Goal

A local run uses the Auth and Firestore emulators and a demo project by default. Only an explicit opt-in with the
registered CI debug token may use the live project.

## Steps

1. **Build env.** `scripts/e2e-env.ts`, a pure function, returns the env the local build gets.
   - With no opt-in: the demo project `demo-before-you-tape`, `VITE_USE_EMULATORS=true`, and placeholder web keys.
   - With `BYT_E2E_LIVE_PROJECT=1`: it requires the CI debug token and throws without it.
   - A unit test checks that no value in the default env holds the live project id or app id.
2. **Playwright config.** The local project starts two web servers: the Auth and Firestore emulators (the rules job
   already has Java and firebase-tools 15.34.2), and `vite build && vite preview` run with the env from step 1. Vite
   lets the process env win over `.env.local`, so a developer's live settings cannot leak in. The config throws at
   load when the opt-in is set without the token.
3. **App Check in emulator builds.** `src/firebase/app.ts` does not start App Check in an emulator build, since the
   emulators do not check it. `verified()` returns true there, so the security-check notice cannot appear in the
   tests. Unit test in `src/firebase/app.test.ts`.
4. **Remote Config and Installations.** An automatic fixture in `tests/e2e/fixtures.ts` answers the Firebase
   Installations call and the Remote Config `:fetch` call from `remoteconfig.template.json`. Every local spec moves
   onto the fixtures, and `leaves.local` waits on that answer. The model hosts are already stubbed.
5. **CI.** Both browser steps run on the emulators. The CI debug token is no longer needed there, so the steps drop
   the secret.

## Cost and risk

- About 6 to 8 commits, touching every local spec's setup. The risk is in the browser tests themselves.
- A spec that needs live-only behaviour is flagged, never bent to pass.
- When done, the opt-in in `scripts/e2e-live-opt-in.ts` stays as the only way to the live project from a local run.

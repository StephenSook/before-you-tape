// The local browser project builds the app with the live Firebase project's settings, so every run reaches the live
// database and Remote Config. Without a registered App Check debug token, App Check fails on localhost and each read
// reaches Firestore with a placeholder token, which App Check counts as a refused request. So a local run starts only
// with an explicit opt-in and a token: in CI the registered CI token, from the secret; elsewhere it or a developer's
// own registered token. (Moving these runs onto the emulators is planned in docs/e2e-emulators-plan.md.)
export function localLiveOptIn(env: Record<string, string | undefined>): void {
  const token = (env.CI ? env.APPCHECK_DEBUG_TOKEN_CI : env.APPCHECK_DEBUG_TOKEN_CI || env.APPCHECK_DEBUG_TOKEN)?.trim();
  if (env.BYT_E2E_LIVE_PROJECT === "1" && token) return;
  throw new Error(
    "The local browser tests run against the live Firebase project, so they start only with BYT_E2E_LIVE_PROJECT=1 and "
    + "APPCHECK_DEBUG_TOKEN_CI (the registered CI App Check debug token; outside CI, APPCHECK_DEBUG_TOKEN with a token "
    + "registered for this project also works). Without a token, App Check fails on localhost and the live database "
    + "counts every read as a refused request.",
  );
}

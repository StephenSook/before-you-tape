// Whether App Check can verify this browser. True once a token comes back. False when the exchange is refused
// (an unregistered debug token, a low reCAPTCHA score), when the SDK throttles after such a refusal, or when
// reCAPTCHA fails. False too when the browser is online and no answer comes within the wait: with reCAPTCHA
// blocked, the SDK waits for it forever, and Firestore then never reaches the server. Having no connection is
// not a failed check, so a network error, or no answer while offline, is true.
export const APP_CHECK_WAIT_MS = 30_000;

export function appCheckVerdict(getToken: () => Promise<unknown>, online: () => boolean, waitMs = APP_CHECK_WAIT_MS): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(!online()), waitMs);
    getToken().then(
      () => { clearTimeout(timer); resolve(true); },
      (e: unknown) => {
        clearTimeout(timer);
        resolve((e as { code?: unknown } | null)?.code === "appCheck/fetch-network-error");
      },
    );
  });
}

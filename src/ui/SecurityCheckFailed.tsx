// Shown only when App Check could not verify this browser (src/firebase/appCheckVerdict.ts). The server refuses such a
// browser, and a reload asks App Check again, so the notice says what happened and offers the reload.
export const SECURITY_CHECK_FAILED =
  "This browser did not pass the site's security check. Reload the page and try again; if it fails again, try a normal browser window.";

export function SecurityCheckFailed({ onReload }: { onReload?: (() => void) | undefined }) {
  return (
    <p data-testid="unverified" role="alert">
      {SECURITY_CHECK_FAILED}{" "}
      <button type="button" onClick={() => (onReload ?? (() => window.location.reload()))()}>Reload page</button>
    </p>
  );
}

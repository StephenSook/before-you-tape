export function PrivacyLink() {
  return <a href="./extension-privacy.html" target="_blank" rel="noreferrer">Privacy</a>;
}

export function Notice({ onAgree, busy = false }: { onAgree(): void; busy?: boolean }) {
  return (
    <>
      <p>This panel reads what you type or paste here. When you click the toolbar button, it also reads this tab's title and link. Everything stays on this laptop unless you allow a cloud check. It downloads our current rule list from our site.</p>
      <div className="panel-actions">
        <button type="button" onClick={onAgree} disabled={busy}>OK, start</button>
        <PrivacyLink />
      </div>
    </>
  );
}

interface CloudConsentProps {
  choice: boolean | null;
  busy: boolean;
  onChoice(allowed: boolean): void;
}

export function CloudConsent({ choice, busy, onChoice }: CloudConsentProps) {
  return (
    <details className="cloud-settings">
      <summary>Cloud settings</summary>
      <p>Allow a cloud check? When you press Read in the cloud, your pasted product details go to Google's Gemini through our site.</p>
      <div className="panel-actions">
        <button type="button" aria-pressed={choice === true} disabled={busy} onClick={() => onChoice(true)}>Allow</button>
        <button type="button" aria-pressed={choice === false} disabled={busy} onClick={() => onChoice(false)}>Not now</button>
      </div>
    </details>
  );
}

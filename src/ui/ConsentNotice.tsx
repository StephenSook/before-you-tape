// Asked once, before the first cloud call (spec 5.3). Nothing goes to the cloud until the sender picks.
export const CONSENT_SENTENCE =
  "To check items when this laptop can't, a cropped photo of the item and the words on its label go to Google's Gemini. Allow?";

export function ConsentNotice({ onChoice }: { onChoice: (allow: boolean) => void }) {
  return (
    <section className="banner" aria-labelledby="consent-text">
      <p id="consent-text">{CONSENT_SENTENCE}</p>
      <button type="button" onClick={() => onChoice(true)}>Allow</button>{" "}
      {/* Only the check stays here: the box list still saves each item's category, battery numbers and answers. */}
      <button type="button" onClick={() => onChoice(false)}>Check on this laptop only</button>
    </section>
  );
}

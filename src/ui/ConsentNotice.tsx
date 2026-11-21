import { useEffect, useRef } from "react";

// Asked when a photo first needs the cloud, or when the sender turns cloud checks on (spec 5.3). Nothing goes
// to the cloud until the sender picks. It takes focus, so a keyboard or screen reader user lands on it.
export const CONSENT_SENTENCE =
  "To read items this laptop can't, and to check a read again when the rules ask, the cropped photo goes to Google's Gemini. Allow?";

export function ConsentNotice({ onChoice }: { onChoice: (allow: boolean) => void }) {
  const allow = useRef<HTMLButtonElement>(null);
  useEffect(() => { allow.current?.focus(); }, []);
  return (
    <section className="banner" aria-labelledby="consent-text">
      <p id="consent-text">{CONSENT_SENTENCE}</p>
      <button ref={allow} type="button" onClick={() => onChoice(true)}>Allow</button>{" "}
      {/* Only the check stays here: the box list still saves each item's category, battery numbers and answers. */}
      <button type="button" onClick={() => onChoice(false)}>Check on this laptop only</button>
    </section>
  );
}

// "Use your phone": a QR code of this box's join link. The phone's camera opens it, and the phone joins the
// box once. The code is made by the server, works once, and runs out after a few minutes. The QR code is
// drawn here, on this laptop; the link goes nowhere else.
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { joinErrorText } from "../handoff/client";
import { JOIN_ORIGINS, makeJoinLink } from "../shared/joinLink";

export interface PhoneHandoffProps {
  boxId: string;
  start: (boxId: string) => Promise<{ key: string; expiresAt: number }>;
  onClose: () => void;
  // For tests: how the QR code is drawn, the site the link names, and the clock.
  qr?: (text: string) => Promise<string>;
  origin?: string;
  now?: () => number;
}

const drawQr = (text: string) => QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });

type Phase = { phase: "making" } | { phase: "shown"; svg: string; minutes: number } | { phase: "failed"; text: string };

export function PhoneHandoff({ boxId, start, onClose, qr = drawQr, origin = JOIN_ORIGINS[0], now = Date.now }: PhoneHandoffProps) {
  const [state, setState] = useState<Phase>({ phase: "making" });
  const alive = useRef(true);
  // Asks the server for a code and draws it; the panel starts out "making", and the buttons set it again.
  const load = useCallback(() => {
    start(boxId)
      .then(({ key, expiresAt }) => qr(makeJoinLink(origin, boxId, key)).then((svg) => ({ svg, expiresAt })))
      .then(
        ({ svg, expiresAt }) => { if (alive.current) setState({ phase: "shown", svg, minutes: Math.max(1, Math.round((expiresAt - now()) / 60_000)) }); },
        (e: unknown) => { if (alive.current) setState({ phase: "failed", text: joinErrorText(e) }); },
      );
  }, [boxId, start, qr, origin, now]);
  const again = () => {
    setState({ phase: "making" });
    load();
  };

  useEffect(() => {
    alive.current = true;
    load();
    return () => { alive.current = false; };
  }, [load]);

  return (
    <section className="phone-handoff" aria-label="Use your phone">
      {state.phase === "making" && <p role="status">Making a code.</p>}
      {state.phase === "shown" && (
        <>
          {/* The SVG is drawn locally by the QR library from this box's own link. */}
          <div data-testid="join-qr" className="join-qr" role="img" aria-label="QR code to check this box with your phone" dangerouslySetInnerHTML={{ __html: state.svg }} />
          <p>Scan it with your phone's camera. It works once, for {state.minutes} minutes.</p>
          <p><button type="button" onClick={again}>New code</button> <button type="button" onClick={onClose}>Done</button></p>
        </>
      )}
      {state.phase === "failed" && (
        <>
          <p role="alert">{state.text}</p>
          <p><button type="button" onClick={again}>Try again</button> <button type="button" onClick={onClose}>Done</button></p>
        </>
      )}
    </section>
  );
}

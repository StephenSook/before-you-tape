// /join/<box>.<code>: a phone opened the laptop's QR code in a browser. The code leaves the address bar and
// the history at once, the server checks it (once, in time), and then this phone opens the box.
import { useEffect, useMemo, useState } from "react";
import { joinErrorText } from "../handoff/client";
import { parseJoinLink } from "../shared/joinLink";

export interface JoinViewProps {
  href: string;
  // The site this page is on: a join link for it is accepted, as on the canonical site.
  origin: string;
  join: (boxId: string, key: string) => Promise<{ boxId: string; joined: boolean }>;
  onJoined: (boxId: string) => void;
  // Takes the code out of the address bar and the history.
  forget: () => void;
}

const NOT_A_LINK = "That is not a join link. Scan the code on the laptop again.";

type State = { kind: "joining" } | { kind: "failed"; text: string };

export function JoinView({ href, origin, join, onJoined, forget }: JoinViewProps) {
  const link = useMemo(() => parseJoinLink(href, [origin]), [href, origin]);
  const [state, setState] = useState<State>(() => (link ? { kind: "joining" } : { kind: "failed", text: NOT_A_LINK }));

  useEffect(() => {
    forget();
    if (!link) return;
    let alive = true;
    join(link.boxId, link.key).then(
      (r) => { if (alive) onJoined(r.boxId); },
      (e: unknown) => { if (alive) setState({ kind: "failed", text: joinErrorText(e) }); },
    );
    return () => { alive = false; };
  }, [link, join, onJoined, forget]);

  return (
    <div className="join-page">
      <h1>Join a box</h1>
      {state.kind === "joining" && <p role="status">Joining the box.</p>}
      {state.kind === "failed" && (
        <>
          <p role="alert">{state.text}</p>
          <p><a href="/">Check a box on this phone instead</a></p>
        </>
      )}
    </div>
  );
}

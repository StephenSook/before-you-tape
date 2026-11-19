// The /join/ page on the live site: the join callable through the app's own Firebase, after anonymous
// sign-in. A phone that joins makes the box its current box and opens it.
import { useMemo } from "react";
import { chooseCurrentBox } from "../data/localPersistence";
import { ensureSignedIn, initFirebase, type FirebaseEnv } from "../firebase/app";
import { joinClient, type JoinClient } from "../handoff/client";
import { JoinView } from "./JoinPage";

let client: JoinClient | null = null;
function join(boxId: string, key: string) {
  if (!client) {
    const fb = initFirebase(import.meta.env as unknown as FirebaseEnv);
    client = joinClient(fb.functions, ensureSignedIn(fb.auth));
  }
  return client.joinBox(boxId, key);
}

const forget = () => window.history.replaceState(null, "", "/join");
const open = (boxId: string) => {
  chooseCurrentBox(localStorage, boxId);
  window.location.replace("/");
};

export function JoinRoute() {
  // The address as it was when the page opened, before the code is taken out of it.
  const href = useMemo(() => window.location.href, []);
  return <JoinView href={href} origin={window.location.origin} join={join} onJoined={open} forget={forget} />;
}

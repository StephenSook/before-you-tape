// /blind/:token: opens the reviewer's session by its secret token, loads the item set the session names,
// and shows the blind form. Calls go to that session only; sending locks it. The set file is published with
// the eval set; until it exists the page says the check is not ready, so no placeholder item is ever shown.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { lockSession, openSession, saveCall, type BlindSession } from "../data/blindSession";
import { ensureSignedIn, FirebaseConfigError, initFirebase, type FirebaseEnv } from "../firebase/app";
import { SecurityCheckFailed } from "../ui/SecurityCheckFailed";
import { BlindPage, type BlindCall, type BlindItem } from "./BlindPage";

export interface BlindSet { setId: string; destinations: { code: string; name: string }[]; items: BlindItem[] }

export interface BlindDeps {
  openSession(token: string): Promise<BlindSession | null>;
  loadSet(setId: string): Promise<BlindSet | null>;
  saveCall(token: string, call: BlindCall): Promise<void>;
  lockSession(token: string): Promise<void>;
  // Whether App Check can verify this browser (src/firebase/appCheckVerdict.ts); without it, it is taken to.
  verified?(): Promise<boolean>;
}

type State = { kind: "loading" } | { kind: "error"; text: string } | { kind: "ready"; set: BlindSet; locked: boolean };

export function BlindView({ token, deps, onReload }: { token: string; deps: BlindDeps; onReload?: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // A browser App Check cannot verify is refused the session, or (reCAPTCHA blocked) reads none from an empty
  // cache, so until the session opens the page names the security check instead.
  const [unverified, setUnverified] = useState(false);
  useEffect(() => {
    let alive = true;
    void deps.verified?.().catch(() => false).then((ok) => { if (alive && !ok) setUnverified(true); });
    return () => { alive = false; };
  }, [deps]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const session = await deps.openSession(token);
        if (!session) return alive && setState({ kind: "error", text: "This link is not valid." });
        const set = await deps.loadSet(session.setId);
        if (!set) return alive && setState({ kind: "error", text: "This check is not ready yet." });
        if (alive) setState({ kind: "ready", set, locked: session.locked });
      } catch {
        if (alive) setState({ kind: "error", text: "Could not open this check. Check the connection and reload." });
      }
    })();
    return () => { alive = false; };
  }, [token, deps]);

  if (unverified && state.kind !== "ready") return <SecurityCheckFailed onReload={onReload} />;
  if (state.kind === "loading") return <p role="status">Opening the check.</p>;
  if (state.kind === "error") return <p role="alert">{state.text}</p>;
  return (
    <BlindPage items={state.set.items} destinations={state.set.destinations} locked={state.locked}
      save={(c) => deps.saveCall(token, c)} submit={() => deps.lockSession(token)} />
  );
}

// Fetches the published set; a missing or malformed file means the check is not ready.
async function fetchSet(setId: string): Promise<BlindSet | null> {
  if (!/^[a-z0-9-]{1,64}$/.test(setId)) return null;
  const r = await fetch(`/eval/sets/${setId}.json`, { headers: { Accept: "application/json" } });
  if (!r.ok || !(r.headers.get("content-type") ?? "").includes("json")) return null;
  const s = (await r.json()) as Partial<BlindSet>;
  return s.setId === setId && Array.isArray(s.items) && Array.isArray(s.destinations) ? (s as BlindSet) : null;
}

export function BlindRoute() {
  const { token = "" } = useParams();
  const deps = useMemo<BlindDeps | Error>(() => {
    try {
      const fb = initFirebase(import.meta.env as unknown as FirebaseEnv);
      const signIn = ensureSignedIn(fb.auth);
      return {
        openSession: (t) => signIn.then(() => openSession(fb.db, t)),
        loadSet: fetchSet,
        saveCall: (t, c) => signIn.then(() => saveCall(fb.db, t, c)),
        lockSession: (t) => signIn.then(() => lockSession(fb.db, t)),
        verified: () => fb.verified(),
      };
    } catch (e) {
      return e instanceof Error ? e : new Error(String(e));
    }
  }, []);
  if (deps instanceof Error) {
    const text = deps instanceof FirebaseConfigError ? "This copy of the site is missing its settings." : "The check could not start. Reload the page.";
    return <p role="alert">{text}</p>;
  }
  return <BlindView token={token} deps={deps} />;
}

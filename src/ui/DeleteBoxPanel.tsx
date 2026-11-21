// "Delete my saved box": asks first, then deletes the box everywhere it is kept. If it stops part-way, it says what
// is left; trying again is safe, since each step deletes only what is still there.
import { useState } from "react";
import type { DeleteResult, DeleteStep, SignInOutcome } from "../data/deleteSavedBox";

const LEFT: Record<DeleteStep, string> = {
  box: "The saved box could not be fully deleted. Try again.",
  crops: "The saved box is deleted, but this device's photos could not be. Try again.",
  signIn: "The saved box is deleted, but your anonymous sign-in could not be. Try again.",
};

// onDelete(from): a retry passes the step that stopped, so the steps already done are not run again.
export function DeleteBoxPanel({ onDelete, onDone }: { onDelete: (from?: DeleteStep) => Promise<DeleteResult>; onDone: (signIn: SignInOutcome) => void }) {
  const [stage, setStage] = useState<"idle" | "asking" | "working">("idle");
  const [left, setLeft] = useState<DeleteStep | null>(null);
  // The delete could not reach the box, and nothing was changed.
  const [offline, setOffline] = useState(false);
  const run = async (from?: DeleteStep) => {
    setStage("working");
    setLeft(null);
    setOffline(false);
    const r = await onDelete(from);
    if (r.ok) { onDone(r.signIn); return; }
    if ("offline" in r) setOffline(true);
    else setLeft(r.stoppedAt);
    setStage("idle");
  };
  return (
    <div data-testid="delete-box" className="delete-box">
      {offline && <p role="alert">Connect to the internet to delete your saved box.</p>}
      {left && (
        <p role="alert">{LEFT[left]} <button type="button" onClick={() => void run(left)}>Try deleting again</button></p>
      )}
      {stage === "idle" && !left && <button type="button" onClick={() => { setOffline(false); setStage("asking"); }}>Delete my saved box</button>}
      {stage === "asking" && (
        <div role="group" aria-labelledby="delete-box-text">
          <p id="delete-box-text">This deletes every item in this box from this device and from our database. It cannot be undone.</p>
          <button type="button" onClick={() => void run()}>Delete</button>{" "}
          <button type="button" onClick={() => setStage("idle")}>Keep</button>
        </div>
      )}
      {stage === "working" && <p role="status">Deleting your saved box.</p>}
    </div>
  );
}

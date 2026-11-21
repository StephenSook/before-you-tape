// "Delete my saved box": asks first, then deletes the box everywhere it is kept. If it stops part-way, it says what
// is left; trying again is safe, since each step deletes only what is still there.
import { useState } from "react";
import type { DeleteResult, DeleteStep } from "../data/deleteSavedBox";

const LEFT: Record<DeleteStep, string> = {
  box: "Nothing was deleted: the saved box could not be reached. Try again.",
  crops: "The saved box is deleted, but this device's photos could not be. Try again.",
  local: "The saved box is deleted, but this browser kept its copy. Try again.",
  signIn: "The saved box is deleted, but your anonymous sign-in could not be. Try again.",
};

export function DeleteBoxPanel({ onDelete, onDone }: { onDelete: () => Promise<DeleteResult>; onDone: (signIn: "deleted" | "signed_out") => void }) {
  const [stage, setStage] = useState<"idle" | "asking" | "working">("idle");
  const [left, setLeft] = useState<DeleteStep | null>(null);
  const run = async () => {
    setStage("working");
    setLeft(null);
    const r = await onDelete();
    if (r.ok) { onDone(r.signIn); return; }
    setLeft(r.stoppedAt);
    setStage("idle");
  };
  return (
    <div data-testid="delete-box" className="delete-box">
      {left && (
        <p role="alert">{LEFT[left]} <button type="button" onClick={() => void run()}>Try deleting again</button></p>
      )}
      {stage === "idle" && !left && <button type="button" onClick={() => setStage("asking")}>Delete my saved box</button>}
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

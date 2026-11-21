// One line when a new version is waiting. The page reloads into it only when the visitor presses Reload, so an open
// session is never yanked.
import { useWaitingUpdate } from "./update";

export function UpdateLine() {
  const apply = useWaitingUpdate();
  if (!apply) return null;
  return (
    <p className="update-line" role="status" data-testid="update-line">
      A new version is ready. <button type="button" onClick={() => void apply()}>Reload</button>
    </p>
  );
}

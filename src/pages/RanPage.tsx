// /ran: where each step runs and what leaves the device. It follows the routing in src/routing/policy.ts
// (chooseImageRoute, chooseReadRoute, shouldRunSecondLook) and the cloud switch the sender controls.
import { MeasuredSection } from "../ran/MeasuredSection";
import { localDay } from "../shared/localDay";
import { BOX_LIST_SAVED } from "../ui/boxListCopy";

// The measured totals, written by scripts/measure-routes.ts. Until the first one is committed there is none, and the
// page says so.
const FILE: unknown = Object.values(import.meta.glob("../ran/measured.json", { eager: true, import: "default" }))[0];

const ROWS: { action: string; runs: string; leaves: string }[] = [
  { action: "Type an item", runs: "No model. The rules run in your browser.", leaves: "Nothing." },
  { action: "Hold an item still in front of the camera", runs: "The built-in model on this device, if it has one. Otherwise nothing runs until you press Check now.", leaves: "Nothing: a read the camera starts by itself uses this device, never the cloud." },
  { action: "Check now, or add a photo and press Check this part", runs: "The built-in model on this device first. Without one, Gemini in the cloud through Firebase AI Logic, only if you allowed cloud checks.", leaves: "Only if it goes to the cloud: the part inside the box and the words on its label." },
  { action: "Check it in the cloud (a second look)", runs: "Gemini in the cloud, only when you press it, and only if cloud checks are on.", leaves: "The same cropped part, again." },
  { action: "Change the country", runs: "The rules again, in your browser: 0 model calls.", leaves: "Nothing." },
  { action: "Turn off cloud checks", runs: "Every read that starts after it stays on this device. A read already running makes no further cloud call.", leaves: "Nothing more." },
];

// measured: the totals file to show (the committed one unless a test passes its own); today: this device's date.
export function RanPage(p: { measured?: unknown; today?: string }) {
  const file = "measured" in p ? p.measured : FILE;
  return (
    <div className="ran">
      <h1>What ran where</h1>
      <p>Each thing you can do, where it runs, and what leaves this device.</p>
      <table>
        <thead><tr><th scope="col">You</th><th scope="col">What runs</th><th scope="col">What leaves this device</th></tr></thead>
        <tbody>
          {ROWS.map((r) => <tr key={r.action}><td>{r.action}</td><td>{r.runs}</td><td>{r.leaves}</td></tr>)}
        </tbody>
      </table>
      <p>{BOX_LIST_SAVED}</p>
      <MeasuredSection file={file} today={p.today ?? localDay()} />
    </div>
  );
}

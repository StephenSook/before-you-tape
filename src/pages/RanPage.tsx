// /ran: where each step runs and what leaves the device. It follows the routing in src/routing/policy.ts
// (chooseImageRoute, chooseReadRoute, shouldRunSecondLook) and the cloud switch the sender controls.
import EVAL from "../ran/eval.json";
import { MeasuredSection } from "../ran/MeasuredSection";
import { localDay } from "../shared/localDay";
import { BOX_LIST_SAVED } from "../ui/boxListCopy";
import { READ_TIMING_SENT } from "../ui/readTimingCopy";

// Our own test, written by scripts/ran-eval.ts, and the saved-box totals, written by scripts/measure-routes.ts. Until a
// saved-box totals file is committed there is none, and the page says so.
const FILE: unknown = Object.values(import.meta.glob("../ran/measured.json", { eager: true, import: "default" }))[0];
// The re-score of our test's saved reads, written by scripts/eval-rescore.ts; with none, the page says a verdict can differ.
const RESCORED: unknown = Object.values(import.meta.glob("../ran/rescore.json", { eager: true, import: "default" }))[0];

const ROWS: { action: string; runs: string; leaves: string }[] = [
  { action: "Type an item", runs: "No model. The rules run in your browser.", leaves: "Nothing goes to a model. The box list is saved, as the line below the table says." },
  { action: "Hold an item still in front of the camera", runs: "The built-in model on this device, if it has one. Otherwise nothing runs until you press Check now.", leaves: "No photo and no label text: a read the camera starts by itself uses this device, never the cloud. Its timing record, as the line below the table says." },
  { action: "Check now, or add a photo and press Check this part", runs: "The built-in model on this device first. Without one, Gemini in the cloud through Firebase AI Logic, only if you allowed cloud checks.", leaves: "Only if it goes to the cloud: the part inside the box and the words on its label. Either way, its timing record." },
  { action: "A second look in the cloud", runs: "Gemini in the cloud, only if cloud checks are on, after a photo read on this device when the rules ask for one: by itself once you allowed cloud checks, or when you press Check it in the cloud.", leaves: "The same cropped part, again, and its timing record." },
  { action: "Fix this reading, or type the Wh printed on the label", runs: "No model. The rules run in your browser.", leaves: "Nothing goes to a model. The numbers you type are saved with the box list, as the line below the table says." },
  { action: "Change the country", runs: "The rules again, in your browser: 0 model calls.", leaves: "Nothing goes to a model. The new country is saved with the box list." },
  { action: "Turn off cloud checks", runs: "Every read that starts after it stays on this device. A read already running makes no further cloud call.", leaves: "No more photos or label text. A read on this device still sends its timing record." },
];

// ranEval, rescored and measured: the eval summary, its re-score summary and the saved-box totals to show (the committed
// ones unless a test passes its own); today: this device's date.
export function RanPage(p: { ranEval?: unknown; rescored?: unknown; measured?: unknown; today?: string }) {
  const file = "measured" in p ? p.measured : FILE;
  const evalFile = "ranEval" in p ? p.ranEval : EVAL;
  const rescoreFile = "rescored" in p ? p.rescored : RESCORED;
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
      <p>{READ_TIMING_SENT}</p>
      <MeasuredSection evalFile={evalFile} rescoreFile={rescoreFile} file={file} today={p.today ?? localDay()} />
    </div>
  );
}

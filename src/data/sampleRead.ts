// The sample photo's recorded read (evidence/sample-read/own-18.json): a real read of it on a laptop's own model,
// checked by the app's own read parser, so a sender who tries the sample always sees a verdict.
import evidence from "../../evidence/sample-read/own-18.json";
import { parseItemRead, type ItemRead } from "../shared/itemRead";

export const SAMPLE_READ: { read: ItemRead; ms: number } = { read: parseItemRead(JSON.stringify(evidence.read)), ms: evidence.ms };

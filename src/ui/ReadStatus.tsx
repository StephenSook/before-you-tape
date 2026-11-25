// Says that a photo is being read, and where, while the model runs, so the box never looks idle during a read;
// then where the read ran and how long it took, in the words /judge uses. The line stays mounted, empty when
// nothing is reading, so a screen reader hears each new read. The seconds that tick while a read runs are hidden
// from it, so it hears "Reading on this device" once, not every second.
import { useEffect, useState } from "react";
import type { ReadSource } from "../data/boxStore";
import { SOURCE_TEXT } from "./SourceGlyph";

// inCloud: the route sends the photo to the cloud from the start. A read that starts on this device can still end
// in the cloud; the finished line says where it actually ran.
export type ReadLine =
  | { kind: "reading"; inCloud: boolean; start: number }
  | { kind: "read"; source: ReadSource; ms: number };

// Every read the page has running, oldest first, the newest one that ended with a card, and the number of the newest
// read started. Each read has a number, so one that ends never takes another's line; the newest still running is the
// one shown.
export interface Reads {
  running: { id: number; inCloud: boolean; start: number }[];
  done: { id: number; itemId: string; source: ReadSource; ms: number } | null;
  lastStart: number;
}
export const NO_READS: Reads = { running: [], done: null, lastStart: 0 };
export const readStarted = (s: Reads, id: number, inCloud: boolean, start: number): Reads =>
  ({ ...s, running: [...s.running, { id, inCloud, start }], lastStart: Math.max(s.lastStart, id) });
export const readToCloud = (s: Reads, id: number): Reads =>
  ({ ...s, running: s.running.map((r) => (r.id === id ? { ...r, inCloud: true } : r)) });
// An older read that ends after a newer one does not replace the newer one's line.
export const readDone = (s: Reads, id: number, itemId: string, source: ReadSource, ms: number): Reads =>
  ({ ...s, running: s.running.filter((r) => r.id !== id), done: s.done && s.done.id > id ? s.done : { id, itemId, source, ms } });
export const readEnded = (s: Reads, id: number): Reads =>
  (s.running.some((r) => r.id === id) ? { ...s, running: s.running.filter((r) => r.id !== id) } : s);
// The line to show: the newest read still running; else where the newest read ran, while it is also the newest read
// started (a later read hides it, even one that ended with no card) and its item is in the box.
export function shownRead(s: Reads, inBox: (itemId: string) => boolean): ReadLine | null {
  const r = s.running.at(-1);
  if (r) return { kind: "reading", inCloud: r.inCloud, start: r.start };
  const d = s.done;
  return d && d.id === s.lastStart && inBox(d.itemId) ? { kind: "read", source: d.source, ms: d.ms } : null;
}

export function ReadStatus({ line, now }: { line: ReadLine | null; now: () => number }) {
  const [, setTick] = useState(0);
  const reading = line?.kind === "reading";
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [reading]);
  return (
    <p data-testid="read-status" role="status">
      {line?.kind === "reading" && (
        <>
          {line.inCloud ? "Reading in the cloud" : "Reading on this device"}
          <span aria-hidden="true">, {Math.max(0, Math.floor((now() - line.start) / 1000))} s</span>
        </>
      )}
      {line?.kind === "read" && `${SOURCE_TEXT[line.source]}, ${(line.ms / 1000).toFixed(1)} s`}
    </p>
  );
}

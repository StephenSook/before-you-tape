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

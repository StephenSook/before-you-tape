// Says where an item's read ran, so the sender can see the laptop doing the work.
import type { ReadSource } from "../data/boxStore";

export const SOURCE_TEXT: Record<ReadSource, string> = {
  on_device: "Read on this device",
  in_cloud: "Read in the cloud",
  cloud_unreported: "Route not reported",
  manual: "Typed by you",
  phone_on_device: "Read on your phone",
  phone_cloud: "Read in the cloud, from your phone",
  sample_recorded: "Sample, recorded read",
};

// checkedInCloud: a second look in the cloud has run on this read. The card's numbers are then the merged read's,
// which can be the cloud's, so the line names both reads rather than only where the first one ran.
export function SourceGlyph({ source, checkedInCloud = false }: { source: ReadSource; checkedInCloud?: boolean }) {
  const text = checkedInCloud ? `${SOURCE_TEXT[source]}, then checked in the cloud` : SOURCE_TEXT[source];
  return (
    <span data-testid="source-glyph" role="img" aria-label={text} className="source-glyph">
      <span aria-hidden="true">{text}</span>
    </span>
  );
}

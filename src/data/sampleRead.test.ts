import { describe, expect, it } from "vitest";
import manifest from "../../eval/set/manifest.json";
import evidence from "../../evidence/sample-read/own-18.json";
import { parseItemRead } from "../shared/itemRead";
import { SAMPLE_READ } from "./sampleRead";

describe("the sample photo's recorded read", () => {
  it("is a real read of the tracked sample photo, kept with where and when it ran", () => {
    const item = manifest.items.find((i) => i.itemId === "own-18")!;
    expect(evidence.photoSha256).toBe(item.photoSha256);
    expect(evidence.photo).toBe(item.photo);
    expect(evidence.source).toBe("on_device");
    expect(evidence.runId).toMatch(/^models-\d{4}-\d{2}-\d{2}$/);
    expect(evidence.chromeVersion).toMatch(/^\d+\./);
  });

  it("passes the app's own read check, and is what the page is given", () => {
    expect(parseItemRead(JSON.stringify(evidence.read))).toEqual(evidence.read);
    expect(SAMPLE_READ).toEqual({ read: evidence.read, ms: evidence.ms });
  });
});

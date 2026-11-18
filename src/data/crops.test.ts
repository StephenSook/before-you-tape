import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { ImagePart } from "../ai/port";
import { deleteCrop, loadCrop, saveCrop } from "./crops";

const part = (b: string): ImagePart => ({ mimeType: "image/jpeg", base64: b });

describe("crops", () => {
  it("keeps a crop with its label text on this device and reads it back", async () => {
    await saveCrop("k1", part("AAAA"), "SHEA BODY LOTION 8 FL OZ");
    expect(await loadCrop("k1")).toEqual({ part: part("AAAA"), labelText: "SHEA BODY LOTION 8 FL OZ" });
  });

  it("returns null for a crop it never saved", async () => expect(await loadCrop("never")).toBeNull());

  it("replaces a crop saved again under the same key, and deletes one", async () => {
    await saveCrop("k2", part("BBBB"));
    await saveCrop("k2", part("CCCC"), "NEW");
    expect(await loadCrop("k2")).toEqual({ part: part("CCCC"), labelText: "NEW" });
    await deleteCrop("k2");
    expect(await loadCrop("k2")).toBeNull();
  });
});

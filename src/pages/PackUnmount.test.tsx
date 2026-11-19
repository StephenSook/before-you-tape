// A crop the camera finishes after the sender has left the Pack page starts no read at all: the page that
// would hear a later pause or withdrawal is gone.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ed } from "../../tests/engine/helpers";
import { consentServer } from "../../tests/fakes/consentServer";
import type { ImageHow, ImagePart, ModelPort } from "../ai/port";
import { createBoxStore } from "../data/boxStore";

const late = vi.hoisted(() => ({ emit: null as null | ((part: ImagePart, how: ImageHow) => void) }));
vi.mock("../ui/CameraStage", () => ({
  CameraStage: (p: { onImage: (part: ImagePart, how: ImageHow) => void }) => { late.emit = p.onImage; return null; },
}));
const { PackPage } = await import("./PackPage");

describe("Pack page after the sender leaves", () => {
  it("starts no read for a crop that finishes after the page is gone", async () => {
    const port = (): ModelPort & { generate: ReturnType<typeof vi.fn> } => ({ generate: vi.fn(async () => ({ text: "{}", source: "in_cloud" as const })) });
    const models = { device: port(), hybrid: port(), cloud: port() };
    const store = createBoxStore({ edition: () => ed, persistence: consentServer(), now: () => 0, today: () => "2026-11-20", newId: () => "u1" });
    store.setConsent(true);
    const { unmount } = render(<PackPage store={store} models={models} gate="no_api" config={{ killCloud: false }}
      openCamera={async () => ({ stream: { getTracks: () => [] } as unknown as MediaStream, stop: () => {} })}
      index={[{ code: "CA", name: "Canada", immUrl: "https://pe.usps.com/text/imm/ce_003.htm" }]} saveCrop={async () => {}} online />);
    const emit = late.emit;
    expect(emit).not.toBeNull();
    unmount();
    emit?.({ mimeType: "image/jpeg", base64: "/9j/AAAA" }, "check_now");
    await new Promise((r) => setTimeout(r, 20));
    for (const m of Object.values(models)) expect(m.generate).not.toHaveBeenCalled();
  });
});

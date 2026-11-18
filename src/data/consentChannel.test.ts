import { describe, expect, it, vi } from "vitest";
import { browserConsentChannel } from "./consentChannel";

describe("browserConsentChannel", () => {
  it("reaches the other tabs' channels and not its own", async () => {
    const a = browserConsentChannel();
    const b = browserConsentChannel();
    const atA = vi.fn();
    const atB = vi.fn();
    a.listen(atA);
    const stop = b.listen(atB);
    a.post({ boxId: "box-1", consent: false });
    await vi.waitFor(() => expect(atB).toHaveBeenCalledWith({ boxId: "box-1", consent: false }));
    expect(atA).not.toHaveBeenCalled();
    stop();
  });

  it("ignores a message that is not a consent change", async () => {
    const a = browserConsentChannel();
    const atA = vi.fn();
    a.listen(atA);
    const raw = new BroadcastChannel("byt-cloud-consent");
    raw.postMessage({ boxId: 3, consent: "yes" });
    raw.postMessage({ boxId: "box-1", consent: true });
    await vi.waitFor(() => expect(atA).toHaveBeenCalledTimes(1));
    expect(atA).toHaveBeenCalledWith({ boxId: "box-1", consent: true });
    raw.close();
  });
});

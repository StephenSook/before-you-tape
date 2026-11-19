// A box persistence for page tests whose server keeps one consent answer: what the sender's button last
// saved, which is what the read asks for before every cloud call.
import type { BoxPersistence } from "../../src/data/boxStore";

export function consentServer(start: boolean | null = null): BoxPersistence & { set(v: boolean | null): void } {
  let consent = start;
  return {
    save: () => {},
    load: async () => null,
    saveConsent: (_boxId, v) => { consent = v; },
    readConsent: async () => consent,
    set: (v) => { consent = v; },
  };
}

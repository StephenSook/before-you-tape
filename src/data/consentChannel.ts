// Tells this browser's other tabs when the sender changes cloud consent for a box, so a tab still holding
// the old answer stops using the cloud at once. A BroadcastChannel never delivers to the channel that sent.
import type { ConsentChannel, ConsentMessage } from "./boxStore";

const NAME = "byt-cloud-consent";

function isConsentMessage(m: unknown): m is ConsentMessage {
  if (typeof m !== "object" || m === null) return false;
  const o = m as Record<string, unknown>;
  return typeof o.boxId === "string" && (o.consent === true || o.consent === false || o.consent === null);
}

export function browserConsentChannel(): ConsentChannel {
  // With no BroadcastChannel there is only this tab to tell.
  if (typeof BroadcastChannel === "undefined") return { post: () => {}, listen: () => () => {} };
  const channel = new BroadcastChannel(NAME);
  return {
    post(m) {
      channel.postMessage({ boxId: m.boxId, consent: m.consent });
    },
    listen(f) {
      const onMessage = (e: MessageEvent) => { if (isConsentMessage(e.data)) f({ boxId: e.data.boxId, consent: e.data.consent }); };
      channel.addEventListener("message", onMessage);
      return () => channel.removeEventListener("message", onMessage);
    },
  };
}

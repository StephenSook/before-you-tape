import { ReadFailure } from "../../src/ai/itemRead";
import type { InferenceSourceName } from "../../src/ai/port";
import { clampProductText, readProductText } from "../../src/ai/productText";
import { isBridgeReply, type BridgeReply, type BridgeRequest } from "../../src/bridge/protocol";
import type { ItemRead } from "../../src/shared/itemRead";

const READ_TIMEOUT_MS = 7500;

export interface Bridge {
  read(text: string, signal?: AbortSignal): Promise<{ text: string; source: InferenceSourceName }>;
  close(): void;
}

export async function openBridge(doc: Document, url: string, timeoutMs: number, signal?: AbortSignal): Promise<Bridge | null> {
  const win = doc.defaultView;
  const target = new URL(url, doc.baseURI);
  if (!win || signal?.aborted || target.protocol !== "https:") return null;

  const frame = doc.createElement("iframe");
  frame.hidden = true;
  frame.title = "Before You Tape cloud check";
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.src = target.href;
  const lifetime = new AbortController();
  const close = () => {
    signal?.removeEventListener("abort", close);
    lifetime.abort();
    frame.remove();
  };
  signal?.addEventListener("abort", close, { once: true });

  const exchange = (request: BridgeRequest, deadline: number, abort?: AbortSignal): Promise<BridgeReply | null> => {
    const end = abort ? AbortSignal.any([lifetime.signal, abort]) : lifetime.signal;
    if (end.aborted) return Promise.resolve(null);
    return new Promise((resolve) => {
      const send = () => {
        const peer = frame.contentWindow;
        if (peer) peer.postMessage(request, target.origin);
        else finish(null);
      };
      const receive = (event: MessageEvent<unknown>) => {
        if (event.source !== frame.contentWindow || event.origin !== target.origin) return;
        if (isBridgeReply(event.data) && event.data.id === request.id) finish(event.data);
      };
      const cancel = () => finish(null);
      const timer = win.setTimeout(cancel, deadline);
      const finish = (reply: BridgeReply | null) => {
        win.clearTimeout(timer);
        win.removeEventListener("message", receive);
        frame.removeEventListener("load", send);
        end.removeEventListener("abort", cancel);
        resolve(reply);
      };
      win.addEventListener("message", receive);
      end.addEventListener("abort", cancel, { once: true });
      if (request.kind === "ping") {
        frame.addEventListener("load", send, { once: true });
        doc.body.append(frame);
      } else {
        send();
      }
    });
  };

  const pong = await exchange({ v: 1, id: crypto.randomUUID(), kind: "ping" }, timeoutMs);
  if (!pong?.ok || pong.kind !== "pong" || lifetime.signal.aborted) {
    close();
    return null;
  }

  return {
    async read(text, abort) {
      const reply = await exchange({ v: 1, id: crypto.randomUUID(), kind: "product_read", text }, READ_TIMEOUT_MS, abort);
      if (reply?.ok && reply.kind === "product_read") return { text: reply.text, source: reply.source };
      const failure = reply?.ok === false ? reply.failure : "cloud_unreachable";
      throw new BridgeError(failure);
    },
    close,
  };
}

class BridgeError extends Error {
  constructor(readonly kind: Extract<BridgeReply, { ok: false }>["failure"]) {
    super(kind);
  }
}

type CloudFailure = "invalid_output" | "leak_guard" | "cloud_paused" | "cloud_refused" | "cloud_unreachable";

export async function cloudProductRead(
  bridge: Bridge, productText: string, signal?: AbortSignal,
): Promise<{ read: ItemRead; source: "in_cloud" } | { failed: CloudFailure }> {
  const { text } = clampProductText(productText);
  try {
    return await readProductText({ generate: () => bridge.read(text, signal) }, text, "in_cloud", () => performance.now());
  } catch (error) {
    if (error instanceof ReadFailure && (error.kind === "invalid_output" || error.kind === "leak_guard")) {
      return { failed: error.kind };
    }
    if (error instanceof BridgeError && (error.kind === "cloud_paused" || error.kind === "cloud_refused" || error.kind === "invalid_output")) {
      return { failed: error.kind };
    }
    return { failed: "cloud_unreachable" };
  }
}

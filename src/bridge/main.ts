import hosting from "../../firebase.json";
import { createProductCloudPort } from "../ai/firebaseModels";
import { ReadFailure } from "../ai/itemRead";
import type { ModelPort } from "../ai/port";
import { remoteConfigSource } from "../config/remoteConfig";
import { ensureSignedIn, initFirebase, type FirebaseEnv } from "../firebase/app";
import { BRIDGE_PATH, bridgeParentsFromPolicy, handleBridgeMessage, isAllowedParent, isBridgeRequest } from "./protocol";

const bridgeHeaders = hosting.hosting.headers.find((entry) => entry.source === BRIDGE_PATH);
const policy = bridgeHeaders?.headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
const allowed = bridgeParentsFromPolicy(policy);

if (window.parent !== window && allowed.length > 0) {
  const lifetime = new AbortController();
  window.addEventListener("pagehide", () => lifetime.abort(), { once: true });

  const start = () => {
    const firebase = initFirebase(import.meta.env as unknown as FirebaseEnv);
    return { firebase, config: remoteConfigSource(firebase.app) };
  };
  let services: ReturnType<typeof start> | undefined;
  let version: Promise<string> | undefined;
  let reading = false;

  const cloud: ModelPort = {
    async generate(prompt, _image, options) {
      options?.signal?.throwIfAborted();
      const { firebase, config } = services ??= start();
      await config.ready;
      options?.signal?.throwIfAborted();
      if (config.get().killCloud) throw new ReadFailure("blocked", "cloud checks are paused");
      await ensureSignedIn(firebase.auth);
      options?.signal?.throwIfAborted();
      const settings = config.get();
      if (settings.killCloud) throw new ReadFailure("blocked", "cloud checks are paused");

      const pause = new AbortController();
      const stop = config.subscribe((current) => { if (current.killCloud) pause.abort(); });
      const signal = AbortSignal.any([lifetime.signal, pause.signal, ...(options?.signal ? [options.signal] : [])]);
      try {
        return await createProductCloudPort(firebase.getAi(true), settings.cloudModelItem).generate(prompt, undefined, { signal });
      } catch (error) {
        if (pause.signal.aborted) throw new ReadFailure("blocked", "cloud checks are paused");
        throw error;
      } finally {
        stop();
      }
    },
  };

  async function shaOfBuild(): Promise<string> {
    const response = await fetch("/version.json", {
      cache: "no-store", credentials: "omit", redirect: "error", signal: lifetime.signal,
    });
    if (!response.ok) throw new Error("Build version unavailable");
    const info: unknown = await response.json();
    if (!info || typeof info !== "object" || !("sha" in info) || typeof info.sha !== "string" || !info.sha) {
      throw new Error("Build version unavailable");
    }
    return info.sha;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !isAllowedParent(event.origin, allowed) || lifetime.signal.aborted) return;
    const request = isBridgeRequest(event.data) ? event.data : null;
    if (request?.kind === "product_read") {
      if (reading) {
        window.parent.postMessage({ v: 1, id: request.id, ok: false, failure: "cloud_refused" }, event.origin);
        return;
      }
      reading = true;
    }
    void (async () => {
      try {
        const sha = request?.kind === "ping" ? await (version ??= shaOfBuild()) : "";
        const reply = await handleBridgeMessage(event, {
          allowed, cloud, sha, killCloud: services?.config.get().killCloud ?? false, signal: lifetime.signal,
        });
        if (reply && !lifetime.signal.aborted) window.parent.postMessage(reply, event.origin);
      } catch {
        // An unavailable build or a closed frame leaves the panel to time out.
      } finally {
        if (request?.kind === "product_read") reading = false;
      }
    })();
  });
}

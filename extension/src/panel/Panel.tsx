import { localDay } from "../../../src/shared/localDay";
import { useEffect, useReducer, useRef, useState } from "react";
import { cloudProductRead, type Bridge } from "../bridgeClient";
import type { TabInfo } from "../tabInfo";
import { bundledEdition, type LoadedEdition } from "../edition";
import { Details } from "./Details";
import { CloudConsent, Notice, PrivacyLink } from "./Notice";
import { ProductText, type DeviceProductReader, type ProductReading, type ReadProduct } from "./ProductText";
import { canRead, initial, reduce } from "./state";

export interface PanelProps {
  agreed: boolean;
  device?: DeviceProductReader;
  connectCloud?(signal: AbortSignal): Promise<Bridge | null>;
  cloudConsent: boolean | null;
  saveAgreement(): Promise<void>;
  saveCloudConsent(allowed: boolean): Promise<void>;
  clearStorage(): Promise<void>;
  loadTab(onTab: (tab: TabInfo | null) => void): () => void;
  fetchEdition(signal: AbortSignal): Promise<LoadedEdition>;
}

export function Panel({ agreed, device, connectCloud, cloudConsent, saveAgreement, saveCloudConsent, clearStorage, loadTab, fetchEdition }: PanelProps) {
  const [state, dispatch] = useReducer(reduce, reduce(initial(), { type: "opened", agreed, cloudConsent }));
  const mayRead = canRead(state);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [usedTab, setUsedTab] = useState<TabInfo | null>(null);
  const [itemName, setItemName] = useState("");
  const [draft, setDraft] = useState<(ProductReading & { revision: number }) | undefined>();
  const [loaded, setLoaded] = useState<LoadedEdition>({ edition: bundledEdition, from: "bundled", notice: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState<{ status: "off" | "opening" } | { status: "ready"; bridge: Bridge }>({ status: "off" });
  const bridgeRequest = useRef<AbortController | null>(null);
  const editionRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (mayRead) return loadTab(setTab);
  }, [mayRead, loadTab]);

  useEffect(() => {
    if (!mayRead) return;
    const controller = new AbortController();
    editionRequest.current = controller;
    void fetchEdition(controller.signal).then((edition) => {
      if (!controller.signal.aborted) setLoaded(edition);
    }).catch(() => {
      if (!controller.signal.aborted) setLoaded({
        edition: bundledEdition, from: "bundled", notice: "Could not load the newest rules. Using the built-in rules.",
      });
    });
    return () => controller.abort();
  }, [mayRead, fetchEdition]);

  useEffect(() => () => bridgeRequest.current?.abort(), []);

  function closeCloud() {
    bridgeRequest.current?.abort();
    bridgeRequest.current = null;
    setCloud({ status: "off" });
  }

  async function openCloud(connect: NonNullable<PanelProps["connectCloud"]>) {
    const controller = new AbortController();
    bridgeRequest.current = controller;
    setCloud({ status: "opening" });
    let bridge: Bridge | null = null;
    try {
      bridge = await connect(controller.signal);
    } catch {
      // The full app remains available if this panel cannot open the bridge.
    }
    if (controller.signal.aborted) bridge?.close();
    else setCloud(bridge ? { status: "ready", bridge } : { status: "off" });
  }

  const readCloud: ReadProduct | undefined = cloud.status === "ready" ? async (text, signal) => {
    const connection = bridgeRequest.current;
    if (!connection) throw new Error("cloud_unreachable");
    const active = AbortSignal.any([connection.signal, signal]);
    active.throwIfAborted();
    const result = await cloudProductRead(cloud.bridge, text, active);
    active.throwIfAborted();
    if ("failed" in result) {
      if (result.failed === "cloud_unreachable" || result.failed === "cloud_paused" || result.failed === "cloud_refused") {
        closeCloud();
      }
      throw new Error(result.failed);
    }
    return result;
  } : undefined;

  async function save(change: () => Promise<void>, errorMessage: string) {
    setBusy(true);
    setError("");
    try {
      await change();
    } catch {
      setError(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  const agree = () => save(async () => {
    await saveAgreement();
    dispatch({ type: "agree" });
  }, "Could not save your choice. Try again.");

  const chooseCloud = (allowed: boolean) => {
    closeCloud();
    return save(async () => {
      await saveCloudConsent(allowed);
      dispatch({ type: "cloudConsent", allowed });
      if (allowed && connectCloud) void openCloud(connectCloud);
    }, "Could not save your choice. Try again.");
  };

  const clear = () => save(async () => {
    editionRequest.current?.abort();
    closeCloud();
    await clearStorage();
    setTab(null);
    setUsedTab(null);
    setItemName("");
    setDraft(undefined);
    setLoaded({ edition: bundledEdition, from: "bundled", notice: null });
    dispatch({ type: "clear" });
  }, "Could not clear the data. Try again.");

  return (
    <main>
      <h1>Before You Tape</h1>
      {!mayRead ? (
        <Notice busy={busy} onAgree={() => void agree()} />
      ) : (
        <>
          {tab && (
            <aside>
              <p>From the tab you clicked: {tab.title || tab.url}</p>
              <button type="button" onClick={() => { setUsedTab(tab); setDraft(undefined); setItemName(tab.title); }}>Use it</button>
            </aside>
          )}
          {usedTab && <p>{usedTab.url}</p>}
          {loaded.notice && <p role="status">{loaded.notice}</p>}
          <ProductText device={device} cloud={readCloud} onRead={(result) => {
            setItemName(result.read.itemName);
            setDraft((previous) => ({ ...result, revision: (previous?.revision ?? 0) + 1 }));
          }} />
          <Details draft={draft} key={usedTab?.atMs} edition={loaded.edition} today={localDay()} itemName={itemName} onItemName={setItemName} />
          {cloud.status === "opening" && <p role="status">Opening cloud checks.</p>}
          {cloud.status === "off" && (
            <p>
              Cloud checks are off in this panel.{" "}
              <a href="https://before-you-tape-2026.web.app/" target="_blank" rel="noreferrer">Open the full app</a>
            </p>
          )}
          <CloudConsent choice={state.cloudConsent} busy={busy} onChoice={(allowed) => void chooseCloud(allowed)} />
          <div className="panel-actions">
            <button type="button" disabled={busy} onClick={() => void clear()}>Clear</button>
            <PrivacyLink />
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <footer>Not affiliated with or approved by the US Postal Service.</footer>
    </main>
  );
}

import { localDay } from "../../../src/shared/localDay";
import { useEffect, useReducer, useRef, useState } from "react";
import type { TabInfo } from "../tabInfo";
import { bundledEdition, type LoadedEdition } from "../edition";
import { Details } from "./Details";
import { CloudConsent, Notice, PrivacyLink } from "./Notice";
import { ProductText, type DeviceProductReader, type ProductReading } from "./ProductText";
import { canRead, initial, reduce } from "./state";

export interface PanelProps {
  agreed: boolean;
  device?: DeviceProductReader;
  cloudConsent: boolean | null;
  saveAgreement(): Promise<void>;
  saveCloudConsent(allowed: boolean): Promise<void>;
  clearStorage(): Promise<void>;
  loadTab(onTab: (tab: TabInfo | null) => void): () => void;
  fetchEdition(signal: AbortSignal): Promise<LoadedEdition>;
}

export function Panel({ agreed, device, cloudConsent, saveAgreement, saveCloudConsent, clearStorage, loadTab, fetchEdition }: PanelProps) {
  const [state, dispatch] = useReducer(reduce, reduce(initial(), { type: "opened", agreed, cloudConsent }));
  const mayRead = canRead(state);
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [usedTab, setUsedTab] = useState<TabInfo | null>(null);
  const [itemName, setItemName] = useState("");
  const [draft, setDraft] = useState<(ProductReading & { revision: number }) | undefined>();
  const [loaded, setLoaded] = useState<LoadedEdition>({ edition: bundledEdition, from: "bundled", notice: null });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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

  const chooseCloud = (allowed: boolean) => save(async () => {
    await saveCloudConsent(allowed);
    dispatch({ type: "cloudConsent", allowed });
  }, "Could not save your choice. Try again.");

  const clear = () => save(async () => {
    editionRequest.current?.abort();
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
          <ProductText device={device} onRead={(result) => {
            setItemName(result.read.itemName);
            setDraft((previous) => ({ ...result, revision: (previous?.revision ?? 0) + 1 }));
          }} />
          <Details draft={draft} key={usedTab?.atMs} edition={loaded.edition} today={localDay()} itemName={itemName} onItemName={setItemName} />
          <p>
            Cloud checks are off in this panel.{" "}
            <a href="https://before-you-tape-2026.web.app/" target="_blank" rel="noreferrer">Open the full app</a>
          </p>
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

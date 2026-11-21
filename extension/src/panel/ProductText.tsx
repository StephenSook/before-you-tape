import { useEffect, useRef, useState } from "react";
import type { GateState } from "../../../src/ai/port";
import { clampProductText } from "../../../src/ai/productText";
import type { ItemRead } from "../../../src/shared/itemRead";
import type { Route } from "../check";

export type ProductReading = { read: ItemRead; source: Exclude<Route, "typed"> };
export type ReadProduct = (text: string, signal: AbortSignal) => Promise<ProductReading>;

export interface DeviceProductReader {
  check(): Promise<GateState>;
  prepare(onProgress: (fraction: number) => void): Promise<void>;
  read: ReadProduct;
}

export function ProductText({ device, onRead }: { device?: DeviceProductReader; onRead(result: ProductReading): void }) {
  const [{ text, truncated }, setInput] = useState({ text: "", truncated: false });
  const [gate, setGate] = useState<GateState>(device ? "checking" : "no_api");
  const [progress, setProgress] = useState<number | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!device) return;
    let active = true;
    void device.check().then((state) => { if (active) setGate(state); });
    return () => { active = false; };
  }, [device]);

  useEffect(() => () => request.current?.abort(), []);

  async function download() {
    if (!device) return;
    setGate("downloading");
    setProgress(0);
    setError("");
    try {
      await device.prepare(setProgress);
    } catch {
      setError("Could not get the model ready. You can type the details.");
    } finally {
      setProgress(null);
      setGate(await device.check());
    }
  }

  async function read(readProduct: ReadProduct) {
    if (reading || !text.trim()) return;
    const controller = new AbortController();
    request.current = controller;
    setReading(true);
    setError("");
    try {
      const result = await readProduct(text, controller.signal);
      if (!controller.signal.aborted) onRead(result);
    } catch {
      if (!controller.signal.aborted) setError("Could not read the product details. You can type them.");
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  }

  const deviceReady = gate === "available" && device;
  return (
    <section className="product-text">
      {(deviceReady || gate === "downloadable" || gate === "downloading") && (
        <label>
          Paste the product details from the shop page
          <textarea rows={3} value={text} onChange={(event) => {
            request.current?.abort();
            setReading(false);
            setError("");
            setInput(clampProductText(event.currentTarget.value));
          }} />
        </label>
      )}
      {truncated && <p role="status">Only the first 2,000 characters will be read.</p>}
      {gate === "checking" && <p role="status">Checking this laptop for the built-in model.</p>}
      {(gate === "no_api" || gate === "unavailable") && <p>This laptop has no built-in model. Type the details.</p>}
      {gate === "downloadable" && <button type="button" onClick={() => void download()}>Get this laptop ready</button>}
      {gate === "downloading" && (
        <div role="status">
          Downloading the built-in model.
          {progress === null
            ? <button type="button" onClick={() => void device?.check().then(setGate)}>Check again</button>
            : <progress value={progress} max={1} aria-label="Model download progress" />}
        </div>
      )}
      {deviceReady && (
        <button type="button" disabled={reading || !text.trim()} onClick={() => void read(device.read)}>Read on this laptop</button>
      )}
      {reading && <p role="status">Reading the product details.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

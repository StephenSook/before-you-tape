import { expect, it, vi } from "vitest";
import { SAMPLE_READ } from "../../src/data/sampleRead";
import { cloudProductRead, openBridge, type Bridge } from "./bridgeClient";

const url = "https://bridge.example/ext-bridge.html";
const origin = new URL(url).origin;

it("removes a bridge that does not answer", async () => {
  const connecting = openBridge(document, url, 20);
  expect(document.querySelector("iframe")?.src).toBe(url);
  await expect(connecting).resolves.toBeNull();
  expect(document.querySelector("iframe")).toBeNull();
});

it("accepts replies only from the active frame, exact origin and matching request", async () => {
  const connecting = openBridge(document, url, 1000);
  const frame = document.querySelector("iframe")!;
  const peer = frame.contentWindow!;
  const send = vi.spyOn(peer, "postMessage").mockImplementation(() => {});
  const settled = vi.fn();
  void connecting.then(settled);
  const reply = (data: unknown, source = peer, from = origin) => {
    window.dispatchEvent(new MessageEvent("message", { origin: from, source, data }));
  };
  frame.dispatchEvent(new Event("load"));
  const [ping, pingOrigin] = send.mock.calls[0]!;
  expect(ping).toMatchObject({ v: 1, kind: "ping" });
  expect(pingOrigin).toBe(origin);
  const pong = { v: 1, id: ping.id, ok: true, kind: "pong", sha: "test-sha" };
  reply(pong, window);
  reply(pong, peer, "https://elsewhere.example");
  reply({ ...pong, id: "some-other-request" });
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();

  reply(pong);
  const bridge = await connecting;
  expect(bridge).not.toBeNull();
  try {
    const read = bridge!.read("Product details");
    const [request, target] = send.mock.calls[1]!;
    expect(request).toMatchObject({ kind: "product_read", text: "Product details" });
    expect(target).toBe(origin);
    reply({ v: 1, id: request.id, ok: true, kind: "product_read", text: "{}", source: "in_cloud" });
    await expect(read).resolves.toEqual({ text: "{}", source: "in_cloud" });
    const pending = bridge!.read("Pending read");
    bridge!.close();
    await expect(pending).rejects.toMatchObject({ kind: "cloud_unreachable" });
    expect(document.querySelector("iframe")).toBeNull();
  } finally {
    bridge?.close();
  }
});

it("parses and grounds the cloud reply in the panel", async () => {
  const read = vi.fn<Bridge["read"]>().mockResolvedValue({
    text: JSON.stringify({ ...SAMPLE_READ.read, wattHours: 99, labelText: "False label", evidence: "label_read" }),
    source: "in_cloud",
  });
  const bridge = { read, close: vi.fn() };
  const text = "Soft cotton scarf";
  await expect(cloudProductRead(bridge, text))
    .resolves.toMatchObject({ read: { wattHours: 0, labelText: "", evidence: "item_seen" }, source: "in_cloud" });
  expect(read).toHaveBeenCalledWith(text, undefined);

  read.mockResolvedValueOnce({ text: '{"volts":9}', source: "in_cloud" });
  await expect(cloudProductRead(bridge, text)).resolves.toEqual({ failed: "invalid_output" });
  read.mockResolvedValueOnce({ text: "{}", source: "on_device" });
  await expect(cloudProductRead(bridge, text)).resolves.toEqual({ failed: "leak_guard" });
});

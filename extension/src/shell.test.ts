import { expect, it, vi } from "vitest";
import manifest from "../manifest.json";
import { onToolbarClick, tabInfoFrom } from "./tabInfo";
import { initial, reduce } from "./panel/state";

const webTab = { id: 7, title: "Kettle", url: "https://shop.example/p/1" };

it("ignores tabs that are not web pages", () => {
  expect(tabInfoFrom({ ...webTab, url: "chrome://extensions" }, 5)).toBeNull();
  expect(tabInfoFrom(webTab, 5)).toEqual({ tabId: 7, title: "Kettle", url: webTab.url, atMs: 5 });
});

it("opens the panel before any await, so the click is still the user's gesture", async () => {
  const order: string[] = [];
  onToolbarClick(webTab, {
    open: async () => { order.push("open"); },
    setSession: async () => { order.push("set"); },
  }, 5);
  expect(order).toEqual(["open"]);
  await vi.waitFor(() => expect(order).toEqual(["open", "set"]));
});

it("starts on the notice until the sender agrees", () => {
  expect(reduce(initial(), { type: "opened", agreed: false }).phase).toBe("notice");
  expect(reduce(initial(), { type: "opened", agreed: true }).phase).toBe("idle");
});

it("asks for exactly three permissions", () => {
  expect([...manifest.permissions].sort()).toEqual(["activeTab", "sidePanel", "storage"]);
  for (const key of ["host_permissions", "optional_host_permissions", "content_scripts"]) {
    expect(manifest).not.toHaveProperty(key);
  }
});

it("keeps each window's clicked tab in its own session slot", async () => {
  const set = vi.fn(async () => {});
  const stub = vi.fn<(tab: { id: number; windowId: number; title: string; url: string }) => void>();
  const addListener = vi.fn((listener: typeof stub) => { stub.mockImplementation(listener); });
  vi.stubGlobal("chrome", {
    action: { onClicked: { addListener } },
    sidePanel: { open: vi.fn(async () => {}) },
    storage: { local: { get: async () => ({ agreed: true }) }, session: { set } },
  });
  try {
    await import("./background");
    stub({ ...webTab, windowId: 1 });
    stub({ ...webTab, id: 8, windowId: 2, title: "Scarf" });
    await vi.waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    expect(set).toHaveBeenCalledWith({ "tab:1": expect.objectContaining({ tabId: 7, title: "Kettle" }) });
    expect(set).toHaveBeenCalledWith({ "tab:2": expect.objectContaining({ tabId: 8, title: "Scarf" }) });
  } finally {
    vi.unstubAllGlobals();
  }
});

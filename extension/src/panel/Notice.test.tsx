import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { bundledEdition } from "../edition";
import { onToolbarClick } from "../tabInfo";
import { Panel } from "./Panel";
import { canRead, canUseCloud, initial, reduce } from "./state";

function props() {
  return {
    agreed: false,
    cloudConsent: null,
    saveAgreement: vi.fn(async () => {}),
    saveCloudConsent: vi.fn(async () => {}),
    clearStorage: vi.fn(async () => {}),
    loadTab: vi.fn(() => () => {}),
    fetchEdition: vi.fn(async () => ({ edition: bundledEdition, from: "live" as const, notice: null })),
  };
}

it("reads nothing before the sender agrees", () => {
  expect(canRead(initial())).toBe(false);
  render(<Panel {...props()} />);
  expect(screen.queryByLabelText("What is it?")).toBeNull();
  expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "./extension-privacy.html");
});

it("does not load the tab title or the rule file before the sender agrees", async () => {
  const panelProps = props();
  const user = userEvent.setup();
  let resolveAgreement!: () => void;
  const agreement = new Promise<void>((resolve) => { resolveAgreement = resolve; });
  panelProps.saveAgreement.mockReturnValue(agreement);
  render(<Panel {...panelProps} />);
  await user.click(screen.getByRole("button", { name: "OK, start" }));
  expect(panelProps.saveAgreement).toHaveBeenCalledOnce();
  expect(panelProps.loadTab).not.toHaveBeenCalled();
  expect(panelProps.fetchEdition).not.toHaveBeenCalled();
  resolveAgreement();
  await waitFor(() => expect(panelProps.loadTab).toHaveBeenCalledOnce());
  expect(panelProps.fetchEdition).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("What is it?")).toBeVisible();
});

it("the toolbar opens without reading title or link before consent", async () => {
  const readTitle = vi.fn(() => "Private title");
  const readUrl = vi.fn(() => "https://shop.example/p/1");
  const api = { open: vi.fn(async () => {}), setSession: vi.fn(async () => {}), canCapture: vi.fn(async () => false) };
  onToolbarClick({ id: 1, get title() { return readTitle(); }, get url() { return readUrl(); } }, api, 1);
  expect(api.open).toHaveBeenCalledOnce();
  await waitFor(() => expect(api.canCapture).toHaveBeenCalledOnce());
  expect(readTitle).not.toHaveBeenCalled();
  expect(readUrl).not.toHaveBeenCalled();
  expect(api.setSession).not.toHaveBeenCalled();
});

it("treats unanswered cloud consent as no", () => {
  const state = reduce(initial(), { type: "opened", agreed: true });
  expect(canUseCloud(state)).toBe(false);
  expect(canUseCloud({ ...state, cloudConsent: false })).toBe(false);
  expect(canUseCloud({ ...state, cloudConsent: true })).toBe(true);
  expect(canUseCloud({ ...initial(), cloudConsent: true })).toBe(false);
});

it("saves cloud choices without running a cloud check", async () => {
  const panelProps = props();
  const user = userEvent.setup();
  render(<Panel {...panelProps} agreed />);
  await user.click(screen.getByText("Cloud settings"));
  await user.click(screen.getByRole("button", { name: "Allow" }));
  expect(panelProps.saveCloudConsent).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole("button", { name: "Not now" }));
  expect(panelProps.saveCloudConsent).toHaveBeenLastCalledWith(false);
  expect(panelProps.fetchEdition).toHaveBeenCalledOnce();
  expect(screen.getByText("Cloud checks are off in this panel.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Open the full app" })).toHaveAttribute("href", "https://before-you-tape-2026.web.app/");
});

it("clears the panel data and returns to the notice", async () => {
  const panelProps = props();
  const user = userEvent.setup();
  render(<Panel {...panelProps} agreed />);
  await user.type(screen.getByLabelText("What is it?"), "Scarf");
  await user.click(screen.getByRole("button", { name: "Clear" }));
  expect(panelProps.clearStorage).toHaveBeenCalledOnce();
  expect(screen.queryByLabelText("What is it?")).toBeNull();
  expect(screen.getByRole("button", { name: "OK, start" })).toBeVisible();
  expect(panelProps.fetchEdition.mock.calls).toHaveLength(1);
});

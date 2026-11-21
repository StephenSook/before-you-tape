import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReadyButton } from "./ReadyButton";

describe("ReadyButton", () => {
  it("offers to get the laptop ready when the model can be downloaded", async () => {
    const onReady = vi.fn();
    render(<ReadyButton gate="downloadable" progress={null} onReady={onReady} cloudOn={false} />);
    await userEvent.click(screen.getByTestId("ready-button"));
    expect(onReady).toHaveBeenCalled();
    expect(screen.getByTestId("ready-button")).toHaveTextContent("Get this laptop ready");
  });

  it("shows real download progress while it downloads", () => {
    render(<ReadyButton gate="downloading" progress={0.42} onReady={() => {}} cloudOn={false} />);
    expect(screen.getByRole("progressbar", { name: "Getting this laptop ready" })).toHaveAttribute("aria-valuenow", "42");
  });

  it("says the laptop is ready, or that this device checks in the cloud only while the cloud is on", () => {
    const { rerender, container } = render(<ReadyButton gate="available" progress={null} onReady={() => {}} cloudOn={false} />);
    // With cloud checks off, photos and label text never leave a laptop that reads on its own.
    expect(screen.getByText("This laptop checks items itself. Photos and label text stay on it.")).toBeInTheDocument();
    rerender(<ReadyButton gate="available" progress={null} onReady={() => {}} cloudOn />);
    expect(screen.getByText("This laptop checks items itself.")).toBeInTheDocument();
    rerender(<ReadyButton gate="no_api" progress={null} onReady={() => {}} cloudOn />);
    expect(screen.getByText("This device checks items in the cloud.")).toBeInTheDocument();
    expect(screen.queryByTestId("ready-button")).toBeNull();
    // With the cloud off, the cloud line says it all; this one says nothing.
    rerender(<ReadyButton gate="no_api" progress={null} onReady={() => {}} cloudOn={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

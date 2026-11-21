import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import App from "./App";
import { forgetUpdate, markUpdateReady } from "./pwa/update";
import { builtPagePaths, routePaths } from "./routes";

describe("App", () => {
  it("renders the name and the footer", () => {
    render(<App />);
    expect(screen.getByTestId("wordmark")).toHaveTextContent("Before You Tape");
    expect(screen.getByText("Not affiliated with or approved by the US Postal Service.")).toBeInTheDocument();
  });
});

describe("update line", () => {
  it("shows on any page once a new version is waiting, above the page", () => {
    render(<App />);
    expect(screen.queryByTestId("update-line")).toBeNull();
    try {
      act(() => markUpdateReady(async () => {}));
      const line = screen.getByTestId("update-line");
      expect(line.compareDocumentPosition(screen.getByRole("main")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      act(() => forgetUpdate());
    }
  });
});

describe("header", () => {
  it("links the wordmark home and names every built page in its nav, nothing else", () => {
    render(<App />);
    expect(screen.getByTestId("wordmark")).toHaveAttribute("href", "/");
    const nav = screen.getByRole("navigation", { name: "Pages" });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([["Sample box", "/judge"], ["Rules", "/rules"], ["What ran where", "/ran"], ["About", "/about"]]);
  });
});

describe("not found", () => {
  it("names the missing page and links home and to the sample box", () => {
    window.history.pushState({}, "", "/no-such-page");
    try {
      render(<App />);
      expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Pack a box" })).toHaveAttribute("href", "/");
      expect(screen.getByRole("link", { name: "Judges: start here" })).toHaveAttribute("href", "/judge");
    } finally {
      window.history.pushState({}, "", "/");
    }
  });
});

describe("routes", () => {
  const publicPaths = ["/", "/judge", "/rules", "/ran", "/about", "/blind/:token"];

  it("serves the public routes in every build", () => {
    expect(routePaths(false)).toEqual(publicPaths);
  });

  it("serves only pages that are built, never a title-only stub", () => {
    const built = new Set([...builtPagePaths(), "/blind/:token"]);
    expect(routePaths(false).filter((p) => !built.has(p))).toEqual([]);
  });

  it("adds the desk routes only in development builds", () => {
    expect(routePaths(true)).toEqual([...publicPaths, "/desk/listing", "/desk/eval"]);
    expect(routePaths(false).some((p) => p.startsWith("/desk"))).toBe(false);
  });
});

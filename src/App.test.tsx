import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { routePaths } from "./routes";

describe("App", () => {
  it("renders the name and the footer", () => {
    render(<App />);
    expect(screen.getByTestId("wordmark")).toHaveTextContent("Before You Tape");
    expect(screen.getByText("Not affiliated with or approved by the US Postal Service.")).toBeInTheDocument();
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

describe("routes", () => {
  const publicPaths = ["/", "/judge", "/measured", "/rules", "/ran", "/about", "/worksheet", "/blind/:token"];

  it("serves the public routes in every build", () => {
    expect(routePaths(false)).toEqual(publicPaths);
  });

  it("adds the desk routes only in development builds", () => {
    expect(routePaths(true)).toEqual([...publicPaths, "/desk/listing", "/desk/eval"]);
    expect(routePaths(false).some((p) => p.startsWith("/desk"))).toBe(false);
  });
});

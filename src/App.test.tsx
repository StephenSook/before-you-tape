import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import { routePaths } from "./routes";

describe("App", () => {
  it("renders the name and the footer", () => {
    render(<App />);
    expect(screen.getByText("Before You Tape")).toBeInTheDocument();
    expect(screen.getByText("Not affiliated with or approved by the US Postal Service.")).toBeInTheDocument();
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

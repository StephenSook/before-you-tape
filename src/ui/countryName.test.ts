import { describe, expect, it } from "vitest";
import { inCountry } from "./countryName";

describe("inCountry", () => {
  it("puts the before a country whose English name takes it, and nothing before the rest", () => {
    expect(inCountry("Philippines")).toBe("the Philippines");
    expect(inCountry("United Kingdom")).toBe("the United Kingdom");
    expect(inCountry("Netherlands")).toBe("the Netherlands");
    expect(inCountry("Dominican Republic")).toBe("the Dominican Republic");
    expect(inCountry("Canada")).toBe("Canada");
    expect(inCountry("Germany")).toBe("Germany");
  });
});

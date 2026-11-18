import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("the privacy page names what is read, what leaves, and the limited use statement", () => {
  const page = readFileSync("public/extension-privacy.html", "utf8");
  for (const phrase of ["tab's title and link", "Google's Gemini", "Limited Use", "Not affiliated", "Clear", "uninstall"]) {
    expect(page).toContain(phrase);
  }
});

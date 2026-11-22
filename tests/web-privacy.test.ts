// The web app's public privacy page names every kind of thing the saved box list holds, as forStorage in
// src/data/boxStore.ts sends it to Firestore.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("the web privacy page names the label figures the saved box list holds", () => {
  const page = readFileSync("public/privacy/index.html", "utf8");
  expect(page).toContain("its battery numbers, the Wh and lithium-grams figures its label names (numbers only)");
});

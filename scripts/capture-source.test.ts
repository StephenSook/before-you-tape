import { describe, expect, it } from "vitest";
import { mainText, sections } from "./capture-source";

const page = `<html><head><style>p{}</style></head><body><nav>Menu &amp; links</nav>
<main property="mainContentOfPage"><h1>Importing by mail</h1><p>Intro &amp; more.</p>
<h2 id="a">Value in Canadian dollars</h2><p>Under the <em>Order</em>, if someone mails you an item worth CAN$20 or less, there is no duty.</p>
<ul><li>tobacco;</li><li>books;</li></ul>
<h2 id="b">Gifts</h2><ul><li>If you receive a gift worth CAN$60 or less, you will not have to pay.</li></ul><script>var x = "<p>no</p>";</script>
<h2>Mailing goods home</h2><p>Other.</p><p>Date modified: 2025-11-25</p></main><footer>Footer</footer></body></html>`;

describe("mainText", () => {
  it("is the main element's text, one block a line, with tags, scripts and entities resolved", () => {
    expect(mainText(page)).toBe([
      "Importing by mail", "Intro & more.", "Value in Canadian dollars",
      "Under the Order, if someone mails you an item worth CAN$20 or less, there is no duty.", "tobacco;", "books;",
      "Gifts", "If you receive a gift worth CAN$60 or less, you will not have to pay.", "Mailing goods home", "Other.",
      "Date modified: 2025-11-25",
    ].join("\n"));
  });

  it("refuses a page with no main element, rather than read the menus", () => {
    expect(() => mainText("<html><body><p>x</p></body></html>")).toThrow(/main/);
  });
});

describe("sections", () => {
  it("is each named heading's lines, up to the next heading", () => {
    expect(sections(mainText(page), ["Value in Canadian dollars", "Gifts"], ["Mailing goods home"])).toBe([
      "Value in Canadian dollars", "Under the Order, if someone mails you an item worth CAN$20 or less, there is no duty.", "tobacco;", "books;",
      "Gifts", "If you receive a gift worth CAN$60 or less, you will not have to pay.",
    ].join("\n"));
  });

  it("refuses a heading the page does not have", () => {
    expect(() => sections(mainText(page), ["Duty rates"], [])).toThrow(/Duty rates/);
  });
});

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderLegal } from "./legal-pages";

const root = process.cwd();
const sources = readdirSync(join(root, "legal")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));

describe("renderLegal", () => {
  it("turns headings, paragraphs, lists, bold and links into a page, escaping everything else", () => {
    const html = renderLegal("# Privacy\n\nOne line\nwrapped.\n\n## Lists\n\n- A <b> & \"c\"\n  goes on.\n- **Bold** [link](/privacy/)\n\n1. First\n2. Second\n", "privacy");
    expect(html).toContain("<title>Privacy | Before You Tape</title>");
    expect(html).toContain("<h1>Privacy</h1>");
    expect(html).toContain("<p>One line wrapped.</p>");
    expect(html).toContain("<h2>Lists</h2>");
    expect(html).toContain("<li>A &lt;b&gt; &amp; &quot;c&quot; goes on.</li>");
    expect(html).toContain('<li><strong>Bold</strong> <a href="/privacy/">link</a></li>');
    expect(html).toContain("<ol><li>First</li><li>Second</li></ol>");
    expect(html).toContain('<a href="/">Before You Tape</a>');
  });

  it("refuses a link that is not to this site or to https", () => {
    expect(() => renderLegal("See [x](javascript:alert(1))", "privacy")).toThrow(/link/);
  });
});

describe("the served legal pages", () => {
  it("are exactly the rendering of their sources in legal/", () => {
    expect(sources.sort()).toEqual(["privacy", "support"]);
    for (const name of sources) {
      const md = readFileSync(join(root, "legal", `${name}.md`), "utf8");
      expect(readFileSync(join(root, "public", name, "index.html"), "utf8"), name).toBe(renderLegal(md, name));
    }
  });

  it("hold no placeholder left for the owner to fill in", () => {
    for (const name of sources) {
      const md = readFileSync(join(root, "legal", `${name}.md`), "utf8");
      expect(md.match(/\[[^\]]+\](?!\()/g) ?? [], name).toEqual([]);
    }
  });
});

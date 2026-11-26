import { describe, expect, it } from "vitest";
import { readServiceAlerts, visibleHtml } from "./usps-alerts";

// The shape of the USPS international service alerts page as read on 2026-11-25: a hidden message bar left over from
// the 2024 Canadian postal strike (class "alert inactive", no year), a Canada link and a Bermuda table commented out,
// one live suspension table, and a guarantee table that does not suspend mail.
const PAGE = `<!DOCTYPE html><html><body>
<section id="msgbar" class="alert inactive" >
  <div class="container"><div class="row"><div class="col-12">
    <a class="text-truncate" href="https://about.usps.com/newsroom/service-alerts/welcome.htm " title="Effective Nov. 29, international mail service to Canada is temporarily suspended, due to the strike of the Canadian Union of Postal Workers.">Effective Nov. 29, international mail service to Canada is temporarily suspended, due to the strike of the Canadian Union of Postal Workers. <span>Read more.</span></a>
  </div></div></div>
</section>
<main>
<p class="date">Updated: Nov. 20, 2026</p>
<!-- <a href="/newsroom/service-alerts/international/canada.htm">Canada 1-3-25</a> -->
<!--
<table><tr><th>Suspension Due to Foreign Postal Operator Service Suspension</th></tr><tr><td>Bermuda</td></tr></table>
-->
<table>
  <tr><th colspan="2">Suspension Due to Unavailability of Transportation</th></tr>
  <tr><td><a href="#af">Afghanistan</a><br>Kiribati<br>Yemen</td></tr>
  <tr><td>Haiti</td><td>Sudan</td></tr>
</table>
<p>For already deposited items: Postal Service employees endorse them &ldquo;Mail Service Suspended &mdash; Return to Sender&rdquo;.</p>
<table>
  <tr><th>Suspension of Global Express Guaranteed&reg; Service</th></tr>
  <tr><td>Belarus</td><td>Russia</td></tr>
</table>
</main></body></html>`;

describe("readServiceAlerts", () => {
  it("reads only the suspension tables, not the inactive Canada banner, the commented rows or a guarantee table", () => {
    const r = readServiceAlerts(PAGE);
    expect(r.updated).toBe("Nov. 20, 2026");
    expect(r.suspended).toEqual(["Afghanistan", "Kiribati", "Yemen", "Haiti", "Sudan"]);
    expect(JSON.stringify(r)).not.toMatch(/Canada|Bermuda|Belarus|Nov\. 29/);
  });

  it("drops the inactive message bar and comments before reading anything", () => {
    const v = visibleHtml(PAGE);
    expect(v).not.toContain("msgbar");
    expect(v).not.toContain("Canada");
    expect(v).not.toContain("Bermuda");
    expect(v).toContain("Afghanistan");
  });

  it("still lists a banner that is shown, as a notice for a person to check, never as a suspension", () => {
    const shown = PAGE.replace('class="alert inactive"', 'class="alert"');
    const r = readServiceAlerts(shown);
    expect(r.suspended).not.toContain("Canada");
    expect(r.notices.some((n) => n.includes("Canada is temporarily suspended"))).toBe(true);
  });

  it("finds no suspension on a page with no suspension table, so the command fails instead of reading an empty list", () => {
    expect(readServiceAlerts("<html><body><p>Updated: Nov. 20, 2026</p></body></html>").suspended).toEqual([]);
  });
});

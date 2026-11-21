// The deploy gate's live round trip writes a box on the live site, so once Firestore enforces App Check it must carry
// the CI debug token, from the GitHub secret only, with Playwright's trace off (a trace records request bodies,
// which hold the token's exchange). Both of the spec's browsers get the token, since it opens a second one itself.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const step = (workflow: string, name: string) => {
  const text = readFileSync(`.github/workflows/${workflow}`, "utf8");
  const start = text.indexOf(`- name: ${name}`);
  expect(start, `${workflow} has the step "${name}"`).toBeGreaterThan(-1);
  const next = text.indexOf("\n      - name:", start + 1);
  return text.slice(start, next === -1 ? undefined : next);
};

describe("the deploy gate's live round trip", () => {
  it("gets the CI App Check token from the GitHub secret, with the trace off", () => {
    const s = step("deploy-live.yml", "A saved box comes back from the server");
    expect(s).toContain("APPCHECK_DEBUG_TOKEN_CI: ${{ secrets.APPCHECK_DEBUG_TOKEN_CI }}");
    expect(s).toMatch(/npx playwright test --project=live --trace off tests\/e2e\/roundtrip\.live\.spec\.ts/);
    expect(s).not.toMatch(/echo|tee|upload-artifact/);
  });

  it("gives the token to both of its browsers", () => {
    const spec = readFileSync("tests/e2e/roundtrip.live.spec.ts", "utf8");
    expect(spec).toMatch(/import \{[^}]*\btest\b[^}]*\} from "\.\/fixtures"/);
    expect(spec).toMatch(/giveAppCheckToken\(fresh, appCheckToken\)/);
  });
});

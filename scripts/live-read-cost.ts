// One real cloud read on the live site, with its measured cost. It opens the live Pack page in a browser
// with no on-device model (so the read goes to the cloud), allows cloud checks, adds the test label image,
// captures that generateContent response's usageMetadata, and prices the tokens at the published rates.
// Writes docs/evidence/live-cloud-read-<time>.json. Makes exactly one model call; run it by hand.
//
// Env: APPCHECK_DEBUG_TOKEN (App Check), PRICE_INPUT_PER_M and PRICE_OUTPUT_PER_M (USD per 1M tokens),
// PRICE_SOURCE (the pricing page). Optional: BYT_LIVE_URL.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

export interface Usage { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; totalTokenCount?: number }
export interface Prices { inputPerMillionUsd: number; outputPerMillionUsd: number }

function count(n: number | undefined): number {
  if (n === undefined) return 0;
  if (!Number.isFinite(n) || n < 0) throw new Error(`not a token count: ${n}`);
  return n;
}

// Input tokens at the input rate; output and thinking tokens at the output rate, as the pricing page says.
export function readCostUsd(u: Usage, p: Prices): number {
  return (count(u.promptTokenCount) * p.inputPerMillionUsd + (count(u.candidatesTokenCount) + count(u.thoughtsTokenCount)) * p.outputPerMillionUsd) / 1_000_000;
}

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function main(): Promise<void> {
  const token = need("APPCHECK_DEBUG_TOKEN");
  const prices = { inputPerMillionUsd: Number(need("PRICE_INPUT_PER_M")), outputPerMillionUsd: Number(need("PRICE_OUTPUT_PER_M")) };
  const priceSource = need("PRICE_SOURCE");
  const url = process.env.BYT_LIVE_URL?.trim() || "https://before-you-tape-2026.web.app/";

  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    await context.addInitScript((t) => { (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = t; }, token);
    const page = await context.newPage();
    const calls: Array<{ status: number; ms: number; body: Record<string, unknown> }> = [];
    const started = new Map<string, number>();
    page.on("request", (r) => { if (r.url().includes(":generateContent")) started.set(r.url(), Date.now()); });
    page.on("response", async (r) => {
      if (!r.url().includes(":generateContent")) return;
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      calls.push({ status: r.status(), ms: Date.now() - (started.get(r.url()) ?? Date.now()), body });
    });
    await page.goto(url);
    await page.getByRole("button", { name: "Allow" }).click();
    await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
    const chip = page.getByTestId("verdict-chip").first();
    await chip.waitFor({ timeout: 60_000 });
    const verdict = (await chip.textContent())?.trim() ?? "";
    const source = await page.getByTestId("source-glyph").first().getAttribute("aria-label");

    const call = calls[0];
    if (!call) throw new Error("no generateContent call was seen");
    const usage = (call.body.usageMetadata ?? {}) as Usage;
    const record = {
      ranAt: new Date().toISOString(), url, image: "tests/e2e/fixtures/lotion-label.jpg (a generated test label, not a photo of a real item)",
      modelCalls: calls.length, status: call.status, latencyMs: call.ms, modelVersion: call.body.modelVersion ?? null,
      usage: { promptTokenCount: usage.promptTokenCount ?? 0, candidatesTokenCount: usage.candidatesTokenCount ?? 0, thoughtsTokenCount: usage.thoughtsTokenCount ?? 0, totalTokenCount: usage.totalTokenCount ?? 0 },
      prices: { ...prices, source: priceSource },
      costUsd: { value: readCostUsd(usage, prices), tag: "MEASURED", how: "tokens from this response's usageMetadata times the published paid-tier price" },
      verdict, readSource: source,
    };
    const dir = join(process.cwd(), "docs", "evidence");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `live-cloud-read-${record.ranAt.replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
    console.log(JSON.stringify(record, null, 2));
    console.log(`wrote ${file}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

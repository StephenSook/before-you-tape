import { createHash } from "node:crypto";
import { ITEM_READ_PROMPT, ITEM_READ_SYSTEM } from "../../src/ai/prompts";
import { expect, test } from "./fixtures";

// Local only: the AI Logic endpoint is stubbed, so this checks what our page sends, not the model. The photo is a
// generated test label (tests/e2e/fixtures), not a photo of a real item.
const AI_HOSTS = /firebasevertexai\.googleapis\.com|generativelanguage\.googleapis\.com|aiplatform\.googleapis\.com/;
const lotionRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const modelReply = {
  candidates: [{ index: 0, finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(lotionRead) }] } }],
  modelVersion: "gemini-3.5-flash-lite",
};
type Part = { text?: string; inlineData?: { mimeType?: string; data?: string } };
type Body = { contents?: { parts?: Part[] }[]; systemInstruction?: string | { parts?: Part[] } };

test("a cloud read sends what the page says leaves the device: the part inside the box, with no text but our own prompts", async ({ page }) => {
  // The page judges by its own date, and USPS suspends mail to Canada from 2026-11-29: a fixed day before that.
  await page.clock.install({ time: new Date("2026-11-20T12:00:00") });
  await page.goto("/ran");
  const row = page.getByRole("row").filter({ hasText: "Check now, or add a photo and press Check this part" });
  await expect(row).toContainText("Only if it goes to the cloud: the part inside the box and the words on its label.");

  const bodies: Body[] = [];
  await page.route(AI_HOSTS, async (route) => {
    bodies.push(route.request().postDataJSON() as Body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modelReply) });
  });
  await page.goto("/");
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  const send = page.getByRole("button", { name: "Check this part" });
  await expect(send).toBeEnabled();
  const shownSha = await send.getAttribute("data-part-sha256");
  await send.click();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByTestId("item-card").getByTestId("verdict-chip")).toHaveText("Take it out");

  expect(bodies).toHaveLength(1);
  const body = bodies[0]!;
  const parts = (body.contents ?? []).flatMap((c) => c.parts ?? []);
  // The one image is the part the crop step showed, byte for byte: the label's words leave only inside it.
  const images = parts.filter((p) => p.inlineData);
  expect(images).toHaveLength(1);
  expect(images[0]!.inlineData!.mimeType).toBe("image/jpeg");
  expect(createHash("sha256").update(images[0]!.inlineData!.data ?? "").digest("hex")).toBe(shownSha);
  // Every piece of text in the request is one of the app's fixed prompts: no label text, item name or box data.
  const system = typeof body.systemInstruction === "string" ? [body.systemInstruction] : (body.systemInstruction?.parts ?? []).map((p) => p.text ?? "");
  const texts = [...parts.filter((p) => p.text !== undefined).map((p) => p.text!), ...system];
  expect(texts.length).toBeGreaterThan(0);
  for (const t of texts) expect([ITEM_READ_PROMPT, ITEM_READ_SYSTEM]).toContain(t);
  expect(parts.every((p) => p.text !== undefined || p.inlineData !== undefined)).toBe(true);
});

test("a read on the device sends nothing to a model in the cloud", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-20T12:00:00") });
  // Stands in for Chrome's built-in model, so the app's own on-device path runs; the reply is the read above.
  await page.addInitScript((reply) => {
    const w = window as unknown as { LanguageModel: unknown; __devicePrompts: number };
    w.__devicePrompts = 0;
    w.LanguageModel = {
      availability: async () => "available",
      create: async () => ({ prompt: async () => { w.__devicePrompts++; return reply; }, destroy: () => undefined }),
    };
  }, JSON.stringify(lotionRead));
  const cloudRequests: string[] = [];
  page.on("request", (r) => { if (AI_HOSTS.test(r.url())) cloudRequests.push(r.url()); });
  await page.route(AI_HOSTS, (route) => route.abort());
  await page.goto("/");
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  const send = page.getByRole("button", { name: "Check this part" });
  await expect(send).toBeEnabled();
  await send.click();
  const card = page.getByTestId("item-card");
  await expect(card.getByTestId("verdict-chip")).toHaveText("Take it out");
  await expect(card).toContainText("Read on this laptop");
  await expect(page.getByRole("button", { name: "Allow" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __devicePrompts: number }).__devicePrompts)).toBe(1);
  expect(cloudRequests).toEqual([]);
});

test("a cloud second look sends the same part the page showed, with no text but our own prompts", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-20T12:00:00") });
  // The device read's Wh does not match volts times capacity, so the rules ask for a second look in the cloud.
  const deviceRead = { ...lotionRead, itemName: "Phone", category: "phone", labelText: "LI-ION 3.85V 4000mAh 25Wh", volts: 3.85,
    milliampHours: 4000, wattHours: 25, batteryWords: true, liquid: false, retailBox: "sealed" };
  await page.addInitScript((reply) => {
    (window as unknown as { LanguageModel: unknown }).LanguageModel = {
      availability: async () => "available",
      create: async () => ({ prompt: async () => reply, destroy: () => undefined }),
    };
  }, JSON.stringify(deviceRead));
  const bodies: Body[] = [];
  const cloudReply = { ...modelReply, candidates: [{ ...modelReply.candidates[0]!, content: { role: "model", parts: [{ text: JSON.stringify(deviceRead) }] } }] };
  await page.route(AI_HOSTS, async (route) => {
    bodies.push(route.request().postDataJSON() as Body);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(cloudReply) });
  });
  // The offer is decided when the read lands, and cloud checks stay off until Remote Config's settings arrive: the
  // stand-in model answers at once, so the photo waits for those settings.
  const settings = page.waitForResponse((r) => r.url().includes("firebaseremoteconfig.googleapis.com") && r.url().includes(":fetch") && r.ok());
  await page.goto("/");
  await settings;
  await page.waitForTimeout(1000);
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  const send = page.getByRole("button", { name: "Check this part" });
  await expect(send).toBeEnabled();
  const shownSha = await send.getAttribute("data-part-sha256");
  await send.click();
  const card = page.getByTestId("item-card");
  await expect(card).toContainText("Read on this laptop");
  expect(bodies).toHaveLength(0);
  // Not asked yet: the card offers the look, and asks before anything is sent.
  await card.getByTestId("cloud-look").click();
  await page.getByRole("button", { name: "Allow" }).click();
  await expect.poll(() => bodies.length).toBe(1);
  await expect(card.getByTestId("second-look")).toBeVisible();
  const parts = (bodies[0]!.contents ?? []).flatMap((c) => c.parts ?? []);
  const images = parts.filter((p) => p.inlineData);
  expect(images).toHaveLength(1);
  expect(images[0]!.inlineData!.mimeType).toBe("image/jpeg");
  expect(createHash("sha256").update(images[0]!.inlineData!.data ?? "").digest("hex")).toBe(shownSha);
  const system = typeof bodies[0]!.systemInstruction === "string" ? [bodies[0]!.systemInstruction] : (bodies[0]!.systemInstruction?.parts ?? []).map((p) => p.text ?? "");
  const texts = [...parts.filter((p) => p.text !== undefined).map((p) => p.text!), ...system];
  expect(texts.length).toBeGreaterThan(0);
  for (const t of texts) expect([ITEM_READ_PROMPT, ITEM_READ_SYSTEM]).toContain(t);
  expect(parts.every((p) => p.text !== undefined || p.inlineData !== undefined)).toBe(true);
});

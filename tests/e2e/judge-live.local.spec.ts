import { expect, test } from "./fixtures";

// Local only: the AI Logic endpoint is stubbed, so this checks the /judge live read's wiring, not the model.
// The sample photo is the tracked eval photo the button reads after checking its bytes.
const lotionRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const modelReply = {
  candidates: [{ index: 0, finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(lotionRead) }] } }],
  modelVersion: "gemini-3.5-flash-lite",
};

test("the /judge live read asks nothing of Google until pressed, then reads the sample after Allow", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-25T12:00:00") });
  const googleBeforePress: string[] = [];
  let pressed = false;
  page.on("request", (r) => { if (!pressed && /googleapis\.com|google\.com\/recaptcha|gstatic\.com\/recaptcha/.test(r.url())) googleBeforePress.push(new URL(r.url()).host); });
  let modelCalls = 0;
  await page.route(/firebasevertexai\.googleapis\.com/, async (route) => {
    modelCalls++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modelReply) });
  });
  await page.goto("/judge");
  await expect(page.getByRole("button", { name: "Run one live read" })).toBeVisible();
  expect(googleBeforePress).toEqual([]);
  pressed = true;
  await page.getByRole("button", { name: "Run one live read" }).click();
  // This browser has no built-in model, so the read needs the cloud, and the cloud needs Allow first.
  await page.getByRole("button", { name: "Allow" }).click();
  const result = page.getByTestId("live-read-result");
  await expect(result.getByTestId("live-read-where")).toContainText("Read in the cloud", { timeout: 30_000 });
  // The sample box starts in the Philippines, where liquid lotion is out.
  await expect(result.getByTestId("verdict-chip")).toHaveText("Take it out");
  expect(modelCalls).toBe(1);
});

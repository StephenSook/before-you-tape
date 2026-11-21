import { expect, test } from "./fixtures";

// Local only: the AI Logic endpoint is stubbed, so this checks our page, not the model. The photo is a
// generated test label (tests/e2e/fixtures), not a photo of a real item.
const lotionRead = {
  itemName: "Body lotion", category: "lotion_cream", labelText: "SHEA BODY LOTION 8 FL OZ", volts: 0, milliampHours: 0, wattHours: 0,
  lithiumGrams: 0, batteryWords: false, liquid: true, pressurized: false, alcoholOnLabel: false, flammableOnLabel: false,
  glassContainer: false, powder: false, retailBox: "cannot_tell", evidence: "label_read",
};
const modelReply = {
  candidates: [{ index: 0, finishReason: "STOP", content: { role: "model", parts: [{ text: JSON.stringify(lotionRead) }] } }],
  modelVersion: "gemini-3.5-flash-lite",
};

test("upload, verdict, country flip", async ({ page }) => {
  // The page judges by its own date, and USPS suspends mail to Canada from 2026-11-29: this checks the
  // verdict and the country switch on a fixed day before that.
  await page.clock.install({ time: new Date("2026-11-20T12:00:00") });
  let modelCalls = 0;
  const sentImages: string[] = [];
  await page.route(/firebasevertexai\.googleapis\.com/, async (route) => {
    modelCalls++;
    const body = route.request().postDataJSON() as { contents?: { parts?: { inlineData?: { data?: string } }[] }[] };
    for (const c of body.contents ?? []) for (const part of c.parts ?? []) if (part.inlineData?.data) sentImages.push(part.inlineData.data);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modelReply) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Allow" }).click();
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  // The photo is never sent whole: the request carries exactly the part the crop step showed.
  const send = page.getByRole("button", { name: "Check this part" });
  await expect(send).toBeEnabled();
  const shown = (await page.getByRole("img", { name: "The part that will be checked" }).getAttribute("src"))?.split(",")[1];
  await send.click();
  // A new box starts in the Philippines, where liquid lotion is out; Canada takes it.
  await expect(page.getByTestId("item-card").getByTestId("verdict-chip")).toHaveText("Take it out");
  expect(sentImages).toEqual([shown]);
  await page.getByTestId("destination-picker").selectOption("CA");
  await expect(page.getByTestId("item-card").getByTestId("verdict-chip")).toHaveText("OK to pack");
  await expect(page.getByTestId("recheck-line")).toContainText("0 model calls");
  expect(modelCalls).toBe(1);
});

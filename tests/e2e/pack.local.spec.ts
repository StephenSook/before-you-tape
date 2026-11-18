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
  let modelCalls = 0;
  await page.route(/firebasevertexai\.googleapis\.com/, async (route) => {
    modelCalls++;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(modelReply) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Allow" }).click();
  await page.getByTestId("upload-input").setInputFiles("tests/e2e/fixtures/lotion-label.jpg");
  await expect(page.getByTestId("verdict-chip")).toHaveText("OK to pack");
  await page.getByTestId("destination-picker").selectOption("PH");
  await expect(page.getByTestId("verdict-chip")).toHaveText("Take it out");
  await expect(page.getByTestId("recheck-line")).toContainText("0 model calls");
  expect(modelCalls).toBe(1);
});

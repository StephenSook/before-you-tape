// Whether a box saved on the live site comes back from the server, not from this browser's own copies.
// The first browser types an item and stays open, so its pending write keeps syncing. A second browser
// starts with only the first one's stored sign-in and the pointer to its box: no Firestore cache and no
// local copy of the box. If the item shows there for the same user, it was read from the server. The
// server never gets an item's own name, only its category's label, so the second browser shows "Clothing"
// and never the typed name, which stays in the first browser. The deploy gate runs this after every
// deploy; it leaves one box with one typed clothing item.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

type BaseState = Awaited<ReturnType<BrowserContext["storageState"]>>;
// Playwright returns each origin's IndexedDB when asked ({ indexedDB: true }), but its types omit the field.
type StorageState = {
  cookies: BaseState["cookies"];
  origins: Array<BaseState["origins"][number] & { indexedDB?: Array<{ name: string } & Record<string, unknown>> }>;
};

// The signed-in user Firebase Auth has stored in this browser, or null before sign-in has finished.
const storedUid = (page: Page) => page.evaluate(() => new Promise<string | null>((resolve) => {
  const open = indexedDB.open("firebaseLocalStorageDb");
  open.onerror = () => resolve(null);
  open.onsuccess = () => {
    try {
      const all = open.result.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAll();
      all.onerror = () => resolve(null);
      all.onsuccess = () => {
        const user = (all.result as Array<{ fbase_key: string; value?: { uid?: string } }>).find((r) => r.fbase_key.startsWith("firebase:authUser"));
        resolve(user?.value?.uid ?? null);
      };
    } catch {
      resolve(null);
    }
  };
}));

// Keep the sign-in and the box pointer; drop every copy of the box itself.
function signInOnly(state: StorageState): StorageState {
  return {
    cookies: state.cookies,
    origins: state.origins.map((o) => ({
      origin: o.origin,
      localStorage: o.localStorage.filter((e) => e.name === "byt.currentBox"),
      indexedDB: (o.indexedDB ?? []).filter((db) => db.name === "firebaseLocalStorageDb"),
    })),
  };
}

test("a typed item comes back from the server in a browser with no copy of the box", async ({ browser, page, context }) => {
  test.setTimeout(150_000);
  const name = `Round-trip check ${new Date().toISOString()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "Type an item" }).click();
  const form = page.getByTestId("add-by-hand");
  await form.getByLabel("What is it?").selectOption("clothing");
  await form.getByLabel("Name (optional)").fill(name);
  await form.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText(name)).toBeVisible();

  // Anonymous sign-in can finish after the item is added; copy the state only once the user is stored.
  await expect.poll(() => storedUid(page), { timeout: 30_000, message: "the first browser signs in" }).not.toBeNull();
  const uid = await storedUid(page);
  const state = signInOnly((await context.storageState({ indexedDB: true })) as StorageState);
  const carried = state.origins.flatMap((o) => o.indexedDB ?? []).map((db) => db.name);
  expect(carried, "only the sign-in database is carried over").toEqual(["firebaseLocalStorageDb"]);
  expect(state.origins.flatMap((o) => o.localStorage).map((e) => e.name), "only the box pointer is carried over").toEqual(["byt.currentBox"]);

  // Each try is a fresh browser, so a miss is never served from a cache; the first browser keeps syncing.
  await expect(async () => {
    const fresh = await browser.newContext({ storageState: state });
    try {
      const second = await fresh.newPage();
      await second.goto("/");
      await expect(second.getByRole("button", { name: "Type an item" })).toBeVisible({ timeout: 20_000 });
      expect(await storedUid(second), "the second browser is the same user").toBe(uid);
      // This user's box holds only the one item, so one card named by its category is that item.
      await expect(second.getByTestId("item-card")).toHaveCount(1, { timeout: 15_000 });
      await expect(second.getByTestId("item-card").locator(".item-name")).toHaveText("Clothing");
      await expect(second.getByText(name), "the typed name stays in the first browser").toHaveCount(0);
    } finally {
      await fresh.close();
    }
  }).toPass({ timeout: 100_000, intervals: [2_000, 5_000] });
});

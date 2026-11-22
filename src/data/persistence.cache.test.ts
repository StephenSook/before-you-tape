// The copy of a box this browser's Firestore cache holds: read from the cache only, never from the server.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", async (orig) => ({
  ...(await orig<typeof import("firebase/firestore")>()),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  getDoc: vi.fn(async () => { throw new Error("the server was asked"); }),
  getDocs: vi.fn(async () => { throw new Error("the server was asked"); }),
  getDocFromCache: vi.fn(),
  getDocsFromCache: vi.fn(),
}));

import { getDoc, getDocFromCache, getDocs, getDocsFromCache, type Firestore } from "firebase/firestore";
import { firestorePersistence } from "./persistence";

const db = {} as Firestore;
const item = { itemId: "i1", quantity: 2, read: { itemName: "Clothing" } };
const snap = (data: Record<string, unknown> | null) => ({ exists: () => data !== null, data: () => data ?? undefined });
const docs = (list: Array<Record<string, unknown> & { itemId: string }>) => ({ docs: list.map((d) => ({ id: d.itemId, data: () => d })) });

describe("firestorePersistence loadCached", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the box and its items from this browser's cache only", async () => {
    vi.mocked(getDocFromCache).mockResolvedValue(snap({ destinationCode: "CA", ownerUid: "u" }) as never);
    vi.mocked(getDocsFromCache).mockImplementation((async (q: { path: string }) => (q.path.endsWith("items") ? docs([item]) : docs([]))) as never);
    const r = await firestorePersistence(db, "u", "ed-1").loadCached!("b1");
    expect(r).toMatchObject({ status: "found", box: { destinationCode: "CA", items: [item] } });
    expect(getDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
  });

  it("has no copy when the cache holds no box, or cannot be read", async () => {
    vi.mocked(getDocFromCache).mockResolvedValueOnce(snap(null) as never);
    expect(await firestorePersistence(db, "u", "ed-1").loadCached!("b1")).toEqual({ status: "missing" });
    vi.mocked(getDocFromCache).mockRejectedValueOnce(Object.assign(new Error("not in the cache"), { code: "unavailable" }));
    expect(await firestorePersistence(db, "u", "ed-1").loadCached!("b1")).toMatchObject({ status: "failed" });
    expect(getDoc).not.toHaveBeenCalled();
  });
});

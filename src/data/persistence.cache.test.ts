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
const snap = (data: Record<string, unknown> | null, fromCache = true) => ({ exists: () => data !== null, data: () => data ?? undefined, metadata: { fromCache } });
const docs = (list: Array<Record<string, unknown> & { itemId: string }>, fromCache = false) =>
  ({ docs: list.map((d) => ({ id: d.itemId, data: () => d })), metadata: { fromCache } });

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

// Firestore answers a read from its cache when it cannot reach the server (with reCAPTCHA blocked, it never can).
describe("firestorePersistence loadBox", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says whether the box came from the server or only from this browser's cache", async () => {
    vi.mocked(getDocs).mockResolvedValue(docs([]) as never);
    vi.mocked(getDoc).mockResolvedValueOnce(snap({ destinationCode: "CA" }, false) as never);
    expect(await firestorePersistence(db, "u", "ed-1").loadBox("b1")).toMatchObject({ status: "found", fromServer: true });
    vi.mocked(getDoc).mockResolvedValueOnce(snap({ destinationCode: "CA" }, true) as never);
    expect(await firestorePersistence(db, "u", "ed-1").loadBox("b1")).toMatchObject({ status: "found", fromServer: false });
    vi.mocked(getDoc).mockResolvedValueOnce(snap(null, true) as never);
    expect(await firestorePersistence(db, "u", "ed-1").loadBox("b1")).toEqual({ status: "missing", fromServer: false });
    vi.mocked(getDoc).mockResolvedValueOnce(snap(null, false) as never);
    expect(await firestorePersistence(db, "u", "ed-1").loadBox("b1")).toEqual({ status: "missing", fromServer: true });
  });

  // The box can come from the server and its items from the cache, if the connection drops between the reads.
  it("says a box came from the server only when its items and disputes did too", async () => {
    vi.mocked(getDoc).mockResolvedValue(snap({ destinationCode: "CA" }, false) as never);
    vi.mocked(getDocs).mockImplementation((async (q: { path: string }) => docs([], q.path.endsWith("items"))) as never);
    expect(await firestorePersistence(db, "u", "ed-1").loadBox("b1")).toMatchObject({ status: "found", fromServer: false });
    vi.mocked(getDocs).mockImplementation((async (q: { path: string }) => docs([], q.path.endsWith("disputes"))) as never);
    expect(await firestorePersistence(db, "u", "ed-1").loadBox("b1")).toMatchObject({ status: "found", fromServer: false });
  });
});

// Crops and the label text read from them stay on this device, in IndexedDB. Neither is ever written to
// Firestore; the box document carries only the tags found in the label text.
import type { ImagePart } from "../ai/port";

const DB_NAME = "before-you-tape";
const DB_VERSION = 1;
const STORE = "crops";

export interface StoredCrop {
  part: ImagePart;
  labelText: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((done, fail) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => done(req.result);
    req.onerror = () => { dbPromise = null; fail(req.error ?? new Error("could not open local storage")); };
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((done, fail) => {
    const tx = db.transaction(STORE, mode);
    const req = op(tx.objectStore(STORE));
    tx.oncomplete = () => done(req.result);
    tx.onerror = () => fail(tx.error ?? req.error ?? new Error("local storage failed"));
    tx.onabort = () => fail(tx.error ?? new Error("local storage was aborted"));
  });
}

export async function saveCrop(key: string, part: ImagePart, labelText = ""): Promise<void> {
  const value: StoredCrop = { part, labelText };
  await run("readwrite", (s) => s.put(value, key));
}

export async function loadCrop(key: string): Promise<StoredCrop | null> {
  const value = (await run("readonly", (s) => s.get(key))) as StoredCrop | undefined;
  return value ?? null;
}

export async function deleteCrop(key: string): Promise<void> {
  await run("readwrite", (s) => s.delete(key));
}

// Deletes every crop whose key `keep` turns down, in one transaction, so a crop saved meanwhile is either
// listed and judged or not touched. Returns how many it deleted.
export async function deleteCropsExcept(keep: (key: string) => boolean): Promise<number> {
  const db = await openDb();
  return new Promise((done, fail) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let gone = 0;
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const key of keys.result) if (typeof key === "string" && !keep(key)) { store.delete(key); gone++; }
    };
    tx.oncomplete = () => done(gone);
    tx.onerror = () => fail(tx.error ?? new Error("local storage failed"));
    tx.onabort = () => fail(tx.error ?? new Error("local storage was aborted"));
  });
}

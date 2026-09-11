import { visible } from "./merge";
import type { Entry } from "./types";

/**
 * Local-first storage. Entries live in IndexedDB alongside their photo blobs,
 * so the app works with no network — which is the realistic case standing in
 * a Naples pizzeria on roaming data.
 */
const DB_NAME = "pizzometro";
const DB_VERSION = 1;
const ENTRIES = "entries";
const PHOTOS = "photos";

let cached: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (cached) return cached;
  cached = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENTRIES)) {
        const store = db.createObjectStore(ENTRIES, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(PHOTOS)) {
        db.createObjectStore(PHOTOS);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return cached;
}

/** Test hook: forget the memoised connection. */
export function resetDbCache(): void {
  cached = null;
}

/**
 * Drops the whole local database — every rating and every photo byte. The
 * open connection has to go first or the delete blocks behind it.
 */
export async function deleteDatabase(): Promise<void> {
  if (cached) {
    try {
      (await cached).close();
    } catch {
      /* Already gone; the delete below is what matters. */
    }
  }
  resetDbCache();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    // Another tab is holding it open: it will be dropped when that tab goes.
    request.onblocked = () => resolve();
  });
}

function run<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = action(tx.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Everything a screen should show: newest first, no tombstones. */
export async function listEntries(): Promise<Entry[]> {
  return visible(await listAllEntries());
}

/** Tombstones included — the sync engine needs to push deletes too. */
export async function listAllEntries(): Promise<Entry[]> {
  const entries = await run<Entry[]>(ENTRIES, "readonly", (store) =>
    store.getAll(),
  );
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getEntry(id: string): Promise<Entry | undefined> {
  return run<Entry | undefined>(ENTRIES, "readonly", (store) => store.get(id));
}

export async function putEntry(entry: Entry): Promise<void> {
  await run(ENTRIES, "readwrite", (store) => store.put(entry));
}

/** Writes a batch in one transaction — used by the sync engine on pull. */
export async function putEntries(entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ENTRIES, "readwrite");
    const store = tx.objectStore(ENTRIES);
    for (const entry of entries) store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Deleting alone removes the row. Deleting inside a trip leaves a tombstone,
 * because a row that simply vanishes here comes straight back on the next
 * pull from the other phone. Either way the photo bytes go.
 */
export async function deleteEntry(id: string, shared = false): Promise<void> {
  const entry = await getEntry(id);
  if (entry?.photoId) await deletePhoto(entry.photoId);
  if (shared && entry) {
    await putEntry({
      ...entry,
      deleted: true,
      updatedAt: Date.now(),
      photoId: undefined,
      photoUrl: undefined,
    });
    return;
  }
  await run(ENTRIES, "readwrite", (store) => store.delete(id));
}

/**
 * Photos are stored as raw bytes plus a MIME type rather than as Blob
 * objects: several Safari versions store a Blob in IndexedDB and hand back
 * an unreadable one later, and bytes clone reliably everywhere.
 */
type StoredPhoto = { type: string; bytes: ArrayBuffer };

export async function putPhoto(id: string, blob: Blob): Promise<void> {
  const record: StoredPhoto = {
    type: blob.type || "image/jpeg",
    bytes: await blob.arrayBuffer(),
  };
  await run(PHOTOS, "readwrite", (store) => store.put(record, id));
}

export async function getPhoto(id: string): Promise<Blob | undefined> {
  const record = await run<StoredPhoto | Blob | undefined>(
    PHOTOS,
    "readonly",
    (store) => store.get(id),
  );
  if (!record) return undefined;
  if (record instanceof Blob) return record;
  return new Blob([record.bytes], { type: record.type });
}

export async function deletePhoto(id: string): Promise<void> {
  await run(PHOTOS, "readwrite", (store) => store.delete(id));
}

/** The small copy's key, derived from the photo's own. */
export function thumbKey(photoId: string): string {
  return `thumb:${photoId}`;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Everything needed to move the log to another phone. */
export async function exportEntries(): Promise<string> {
  const entries = await listEntries();
  return JSON.stringify({ app: "pizzometro", version: 1, entries }, null, 2);
}

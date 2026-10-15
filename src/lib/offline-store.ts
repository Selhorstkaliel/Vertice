/**
 * On-device storage for offline flashcard review (IndexedDB, browser only).
 * Holds only what review needs: card text and schedule, and the queue of
 * reviews not yet synced. Wiped on logout or when another account signs in.
 */

const DB_NAME = "vertice-offline";
const VERSION = 1;

export interface OfflineCard {
  id: string;
  front: string;
  back: string;
  type: string;
  state: "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  learningStep: number;
  dueAt: string;
  lastReviewedAt: string | null;
}

export interface QueuedReview {
  clientId: string;
  flashcardId: string;
  rating: "AGAIN" | "HARD" | "GOOD" | "EASY";
  reviewedAt: string;
  durationMs: number | null;
}

export interface OfflineMeta {
  userId: string;
  downloadedAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      if (!db.objectStoreNames.contains("cards")) db.createObjectStore("cards", { keyPath: "id" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "clientId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(stores: string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await open();
  try {
    const t = db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
    const result = await fn(t);
    await done;
    return result;
  } finally {
    db.close();
  }
}

const all = <T>(store: IDBObjectStore) =>
  new Promise<T[]>((resolve, reject) => {
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result as T[]);
    r.onerror = () => reject(r.error);
  });

export async function getMeta(): Promise<OfflineMeta | null> {
  return tx(["meta"], "readonly", (t) => new Promise((resolve, reject) => {
    const r = t.objectStore("meta").get("meta");
    r.onsuccess = () => resolve((r.result as OfflineMeta | undefined) ?? null);
    r.onerror = () => reject(r.error);
  }));
}

export async function getCards() {
  return tx(["cards"], "readonly", (t) => all<OfflineCard>(t.objectStore("cards")));
}

export async function getQueue() {
  return tx(["queue"], "readonly", (t) => all<QueuedReview>(t.objectStore("queue")));
}

/** Replaces the downloaded cards; reviews still waiting in the queue are kept. */
export async function saveDownload(meta: OfflineMeta, cards: OfflineCard[]) {
  await tx(["meta", "cards"], "readwrite", (t) => {
    t.objectStore("meta").put(meta, "meta");
    const store = t.objectStore("cards");
    store.clear();
    for (const c of cards) store.put(c);
  });
}

/** One review: the card's local schedule moves and the review waits in the queue. */
export async function recordReview(card: OfflineCard, review: QueuedReview) {
  await tx(["cards", "queue"], "readwrite", (t) => {
    t.objectStore("cards").put(card);
    t.objectStore("queue").put(review);
  });
}

export async function removeFromQueue(clientIds: string[]) {
  if (clientIds.length === 0) return;
  await tx(["queue"], "readwrite", (t) => {
    const store = t.objectStore("queue");
    for (const id of clientIds) store.delete(id);
  });
}

/** Deletes everything stored on the device for offline review, and the cached page. */
export async function clearOfflineData() {
  if (typeof indexedDB !== "undefined") {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
  }
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("vertice-")).map((k) => caches.delete(k)));
  }
}

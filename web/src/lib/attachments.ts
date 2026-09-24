// Image attachments live in IndexedDB, with the exact database/store/index the previous app created,
// so images people already attached keep showing up.
const DB_NAME = "blankpage-attachments";
const DB_VERSION = 1;
const STORE = "attachments";

export type Attachment = {
  id: string;
  noteId: string;
  blob: Blob;
  mime: string;
  filename: string;
  size: number;
  createdAt: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB is not supported"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.objectStoreNames.contains(STORE) ? req.transaction!.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: "id" });
      if (!store.indexNames.contains("byNote")) store.createIndex("byNote", "noteId", { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open attachment database"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function listAttachments(noteId: string): Promise<Attachment[]> {
  const db = await openDb();
  const rows = await done(db.transaction(STORE, "readonly").objectStore(STORE).index("byNote").getAll(IDBKeyRange.only(noteId)));
  return (rows as Attachment[]).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

export async function putAttachment(a: Attachment) {
  const db = await openDb();
  await done(db.transaction(STORE, "readwrite").objectStore(STORE).put(a));
}

export async function deleteAttachment(id: string) {
  const db = await openDb();
  await done(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
}

export async function deleteAttachmentsForNote(noteId: string) {
  const db = await openDb();
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  const keys = await done(store.index("byNote").getAllKeys(IDBKeyRange.only(noteId)));
  await Promise.all(keys.map((k) => done(store.delete(k))));
}

export function makeAttachment(noteId: string, file: File): Attachment {
  const ext = file.type.split("/")[1] || "png";
  return {
    id: `attachment_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    noteId,
    blob: file,
    mime: file.type,
    filename: file.name || `image-${Date.now()}.${ext}`,
    size: file.size,
    createdAt: new Date().toISOString(),
  };
}

export const isQuotaError = (e: unknown) =>
  e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");

export const imageFiles = (list: FileList | File[] | null | undefined) => Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));

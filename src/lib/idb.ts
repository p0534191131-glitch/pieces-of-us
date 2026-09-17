/** תמונות שמעלים מהמחשב נשמרות ב-IndexedDB של הדפדפן — לא נשלחות לשום שרת ונשארות לפעם הבאה */

const DB_NAME = "pieces-of-us";
const STORE = "uploads";

export interface StoredUpload {
  id: string;
  label: string;
  blob: Blob;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const uploadsDb = {
  all: () => run<StoredUpload[]>("readonly", (s) => s.getAll() as IDBRequest<StoredUpload[]>),
  put: (item: StoredUpload) => run("readwrite", (s) => s.put(item)),
  remove: (id: string) => run("readwrite", (s) => s.delete(id)),
};

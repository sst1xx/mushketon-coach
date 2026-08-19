/**
 * Transactional read-write with dataEpoch guard.
 *
 * Every write transaction reads dataEpoch from the settings store
 * (which is always included in the transaction) and aborts if
 * the stored value differs from the caller's clientEpoch.
 * This detects concurrent writes from another window/tab.
 */

export class DataEpochMismatchError extends Error {
  constructor() {
    super('dataEpoch mismatch — data restored in another window');
    this.name = 'DataEpochMismatchError';
  }
}

export async function readEpoch(db: IDBDatabase): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get('dataEpoch');
    req.onsuccess = () => resolve(req.result?.value ?? 1);
    req.onerror = () => reject(req.error);
     });
}

/**
 * Execute a read-write transaction with dataEpoch guard.
 * The 'settings' store is always added to the transaction to
 * support the epoch check.
 */
export async function withReadWrite<T>(
  db: IDBDatabase,
  stores: string[],
  clientEpoch: number,
  fn: (tx: IDBTransaction) => T | Promise<T>,
): Promise<T> {
  const allStores = [...new Set([...stores, 'settings'])];
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(allStores, 'readwrite');
    const epochReq = tx.objectStore('settings').get('dataEpoch');
    epochReq.onsuccess = () => {
      const stored = epochReq.result?.value ?? 1;
      if (stored !== clientEpoch) {
         tx.abort();
        reject(new DataEpochMismatchError());
        return;
      }
      Promise.resolve(fn(tx)).then(resolve, reject);
     };
    epochReq.onerror = () => reject(epochReq.error);
     });
}

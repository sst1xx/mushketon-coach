/**
 * IndexedDB open/upgrade.
 * For MVP (version 1, no migrations), opens directly at DB_VERSION.
 */

import { DB_NAME, DB_VERSION } from './schema';

let _db: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db;

  _db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      upgrade((e.target as IDBRequest).result as IDBDatabase, e.oldVersion);
    };
    req.onsuccess = () => { attach(req.result); resolve(req.result); };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB blocked'));
  });

  return _db;
}

export function closeDB(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

function attach(db: IDBDatabase) {
  db.onversionchange = () => {
    db.close();
    _db = null;
  };
}

function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    db.createObjectStore('athletes', { keyPath: 'id' });
    const tr = db.createObjectStore('trainings', { keyPath: 'id' });
    tr.createIndex('athleteId', 'athleteId', { unique: false });
    const sh = db.createObjectStore('shots', { keyPath: 'id' });
    sh.createIndex('trainingId', 'trainingId', { unique: false });
    db.createObjectStore('settings', { keyPath: 'key' });
  }
  if (oldVersion < 2) {
    if (!db.objectStoreNames.contains('comments')) {
      const cm = db.createObjectStore('comments', { keyPath: 'id' });
      cm.createIndex('athleteId', 'athleteId', { unique: false });
      cm.createIndex('trainingId', 'trainingId', { unique: false });
      cm.createIndex('shotId', 'shotId', { unique: false });
    }
  }
}

export class DBVersionTooNewError extends Error {
  constructor(
    public readonly actual: number,
    public readonly supported: number,
  ) {
    super(`DB v${actual} > supported v${supported}`);
    this.name = 'DBVersionTooNewError';
  }
}

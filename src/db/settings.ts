/**
 * Settings store read/write.
 */

import { SCORING_VERSION } from '../scoring';
import type { SettingsKey } from './schema';

export async function getSetting(db: IDBDatabase, key: SettingsKey): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const req = tx.objectStore('settings').get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
    });
}

export async function setSetting(db: IDBDatabase, key: SettingsKey, value: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    });
}

export async function initSettings(db: IDBDatabase): Promise<void> {
   const sv = await getSetting(db, 'SCORING_VERSION');
  if (sv === null) await setSetting(db, 'SCORING_VERSION', SCORING_VERSION);
   const ep = await getSetting(db, 'dataEpoch');
  if (ep === null) await setSetting(db, 'dataEpoch', 1);
   const zm = await getSetting(db, 'targetZoomMode');
  if (zm === null) await setSetting(db, 'targetZoomMode', 'full');
   const tm = await getSetting(db, 'themeMode');
  if (tm === null) await setSetting(db, 'themeMode', 'light');
}

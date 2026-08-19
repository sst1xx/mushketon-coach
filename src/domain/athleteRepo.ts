import { openDB } from '../db/open';
import { readEpoch, withReadWrite } from '../db/tx';
import type { AthleteRecord, TrainingRecord } from '../db/schema';

export async function createAthlete(name: string): Promise<AthleteRecord> {
  const db = await openDB();
  const epoch = await readEpoch(db);
  const now = new Date().toISOString();
  const record: AthleteRecord = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
   };
  await withReadWrite(db, ['athletes'], epoch, (tx) => {
    const req = tx.objectStore('athletes').put(record);
     return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      req.onerror = () => reject(req.error);
      });
    });
  return record;
}

export async function listAthletes(): Promise<AthleteRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('athletes', 'readonly');
    const req = tx.objectStore('athletes').getAll();
    req.onsuccess = () =>
      resolve((req.result as AthleteRecord[]).sort((a, b) => a.name.localeCompare(b.name)));
    req.onerror = () => reject(req.error);
   });
}

/**
 * Cascade-delete: athlete + all its trainings + all their shots.
 * All in ONE readwrite transaction (§19.1 (в)).
 */
export async function deleteAthlete(id: string, clientEpoch: number): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['athletes', 'trainings', 'shots'], clientEpoch, (tx) => {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      // Step 1: get all training IDs for this athlete
      const trGet = tx.objectStore('trainings').index('athleteId').getAll(id);
      trGet.onsuccess = () => {
        const trainings: TrainingRecord[] = trGet.result;

        // Step 2: delete athlete
        tx.objectStore('athletes').delete(id);

        // Step 3: for each training, delete its shots then the training itself
        for (const tr of trainings) {
          const shGet = tx.objectStore('shots').index('trainingId').getAll(tr.id);
          shGet.onsuccess = (e: any) => {
            for (const s of e.target!.result) {
              tx.objectStore('shots').delete(s.id);
             }
             tx.objectStore('trainings').delete(tr.id);
            };
          shGet.onerror = () => reject(shGet.error);
        }
       };
      trGet.onerror = () => reject(trGet.error);
      });
    });
}

/**
 * Startup cleanup: delete draft shots, orphan shots, orphan trainings,
 * and rescore committed shots if SCORING_VERSION changed.
 */

import { score, SCORING_VERSION } from '../scoring';
import { getSetting } from './settings';

/** Collect all primary keys from a store. */
async function collectKeys(db: IDBDatabase, store: string): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const set = new Set<string>();
    const req = tx.objectStore(store).openCursor();
    req.onsuccess = () => {
       const cursor = req.result;
      if (!cursor) return;
      set.add(cursor.primaryKey as string);
      cursor.continue();
      };
    tx.oncomplete = () => resolve(set);
    tx.onerror = () => reject(tx.error);
   });
}

export async function runStartupCleanup(db: IDBDatabase): Promise<void> {
    // 1. Delete draft shots and, in the same transaction, reclaim
    // TrainingRecord.nextShotNumber for every affected training down to
    // max(remaining committed shotNumber) + 1. Without this, drafts left
    // over from an interrupted session (e.g. app closed mid-drag) get wiped
    // on next startup but the counter stays inflated, so freshly created
    // shots skip ahead (e.g. jump to 11 after only 10 committed shots).
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['shots', 'trainings'], 'readwrite');
    const store = tx.objectStore('shots');
    const maxRemainingByTraining = new Map<string, number>();
    const affectedTrainingIds = new Set<string>();
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        // All shots scanned; reclaim nextShotNumber for trainings that had a draft deleted.
        if (affectedTrainingIds.size === 0) return;
        const trainingsStore = tx.objectStore('trainings');
        for (const trainingId of affectedTrainingIds) {
          const trGet = trainingsStore.get(trainingId);
          trGet.onsuccess = () => {
            const tr = trGet.result as any;
            if (!tr) return;
            const reclaimedNext = (maxRemainingByTraining.get(trainingId) ?? 0) + 1;
            if (reclaimedNext < tr.nextShotNumber) {
              tr.nextShotNumber = reclaimedNext;
              trainingsStore.put(tr);
            }
          };
          trGet.onerror = () => reject(trGet.error);
        }
        return;
      }
      const shot = cursor.value as any;
      if (shot.status === 'draft') {
        affectedTrainingIds.add(shot.trainingId);
        cursor.delete();
      } else {
        const prevMax = maxRemainingByTraining.get(shot.trainingId) ?? 0;
        if (shot.shotNumber > prevMax) maxRemainingByTraining.set(shot.trainingId, shot.shotNumber);
      }
      cursor.continue();
       };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
     });

    // 2. Delete orphan shots (trainingId not in trainings)
   const trainingIdSet = await collectKeys(db, 'trainings');
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('shots', 'readwrite');
    const store = tx.objectStore('shots');
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (!trainingIdSet.has((cursor.value as any).trainingId)) cursor.delete();
      cursor.continue();
       };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
     });

    // 3. Delete orphan trainings (athleteId not in athletes)
   const athleteIdSet = await collectKeys(db, 'athletes');
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('trainings', 'readwrite');
    const store = tx.objectStore('trainings');
    const req = store.openCursor();
    req.onsuccess = () => {
       const cursor = req.result;
      if (!cursor) return;
      if (!athleteIdSet.has((cursor.value as any).athleteId)) cursor.delete();
      cursor.continue();
       };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
     });

    // 4. Rescore if SCORING_VERSION mismatch
   const storedVersion = await getSetting(db, 'SCORING_VERSION');
  if (storedVersion !== SCORING_VERSION) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['shots', 'settings'], 'readwrite');
      const store = tx.objectStore('shots');
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        const shot = cursor.value as any;
        if (shot.status === 'committed') {
          shot.score = score(shot.x, shot.y);
          cursor.update(shot);
           }
        cursor.continue();
         };
      tx.objectStore('settings').put({ key: 'SCORING_VERSION', value: SCORING_VERSION });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
       });
     }
}

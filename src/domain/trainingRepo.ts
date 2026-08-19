import { openDB } from '../db/open';
import { readEpoch, withReadWrite } from '../db/tx';
import type { TrainingRecord, ShotRecord } from '../db/schema';

export async function createTraining(
  athleteId: string,
  clientEpoch: number,
): Promise<TrainingRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  const record: TrainingRecord = {
    id: crypto.randomUUID(),
    athleteId,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    nextShotNumber: 1,
    };
  await withReadWrite(db, ['trainings'], clientEpoch, (tx) => {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

       // (a) Invariant: find active training for this athlete, complete it (§13.1.a)
      const activeGet = tx.objectStore('trainings').index('athleteId').getAll(athleteId);
      activeGet.onsuccess = () => {
        const existing = activeGet.result as TrainingRecord[];
         for (const t of existing) {
            if (t.completedAt === null) {
              t.completedAt = now;
              t.updatedAt = now;
              tx.objectStore('trainings').put(t);
              }
             }
          tx.objectStore('trainings').put(record);
         };
      activeGet.onerror = () => reject(activeGet.error);
       });
     });
  return record;
}

export async function listTrainings(
  athleteId: string,
): Promise<TrainingRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trainings', 'readonly');
    const req = tx.objectStore('trainings').index('athleteId').getAll(athleteId);
    req.onsuccess = () =>
      resolve(
        (req.result as TrainingRecord[]).sort(
          (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        ),
      );
    req.onerror = () => reject(req.error);
    });
}

export async function getTraining(id: string): Promise<TrainingRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trainings', 'readonly');
    const req = tx.objectStore('trainings').get(id);
    req.onsuccess = () => resolve(req.result as TrainingRecord | undefined);
    req.onerror = () => reject(req.error);
    });
}

export async function completeTraining(
  id: string,
  clientEpoch: number,
): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  await withReadWrite(db, ['trainings'], clientEpoch, (tx) => {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const get = tx.objectStore('trainings').get(id);
      get.onsuccess = () => {
        const t = get.result as TrainingRecord | undefined;
        if (!t) return;
        t.completedAt = now;
        t.updatedAt = now;
        tx.objectStore('trainings').put(t);
      };
      get.onerror = () => reject(get.error);
      });
     });
}

/**
 * Resume (completed → active), §13.1.б.
 * If another active training exists for the same athlete, complete it first.
 */
export async function resumeTraining(
  id: string,
  clientEpoch: number,
): Promise<void> {
  const db = await openDB();
  const now = new Date().toISOString();
  await withReadWrite(db, ['trainings'], clientEpoch, (tx) => {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

       // Read target to get its athleteId
      const get = tx.objectStore('trainings').get(id);
      get.onsuccess = () => {
        const t = get.result as TrainingRecord | undefined;
        if (!t) return;
         // Complete any other active training of the same athlete
        const activeGet = tx.objectStore('trainings').index('athleteId').getAll(t.athleteId);
        activeGet.onsuccess = () => {
          for (const other of activeGet.result as TrainingRecord[]) {
            if (other.id !== id && other.completedAt === null) {
              other.completedAt = now;
              other.updatedAt = now;
              tx.objectStore('trainings').put(other);
              }
              }
            t.completedAt = null;
            t.updatedAt = now;
            tx.objectStore('trainings').put(t);
            };
        activeGet.onerror = () => reject(activeGet.error);
        };
      get.onerror = () => reject(get.error);
      });
     });
}

/**
 * Cascade-delete: training + all its shots.
 * In ONE readwrite transaction (§19.1 (в)).
 */
export async function deleteTraining(
  id: string,
  clientEpoch: number,
): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['trainings', 'shots'], clientEpoch, (tx) => {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      const shGet = tx.objectStore('shots').index('trainingId').getAll(id);
      shGet.onsuccess = (e: any) => {
        for (const s of e.target!.result as ShotRecord[]) {
          tx.objectStore('shots').delete(s.id);
          }
        tx.objectStore('trainings').delete(id);
      };
      shGet.onerror = () => reject(shGet.error);
      });
     });
}

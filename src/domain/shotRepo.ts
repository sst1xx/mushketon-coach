import { openDB } from '../db/open';
import { readEpoch, withReadWrite } from '../db/tx';
import { score as recomputeScore } from '../scoring';
import type { ShotRecord, TrainingRecord } from '../db/schema';

// ─── createDraft (§19.1 a) ──────────────────────────────────────────────────

/**
 * Create a draft shot and increment training.nextShotNumber in one tx.
 */
export async function createDraft(
  trainingId: string,
  x: number,
  y: number,
  clientEpoch: number,
): Promise<ShotRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  let shot!: ShotRecord;
  await withReadWrite(db, ['shots', 'trainings'], clientEpoch, (tx) => {
    return new Promise<ShotRecord>((resolve, reject) => {
      tx.oncomplete = () => resolve(shot);
      tx.onerror = () => reject(tx.error);
      const trGet = tx.objectStore('trainings').get(trainingId);
      trGet.onsuccess = () => {
        const tr = trGet.result as TrainingRecord;
        if (!tr) { reject(new Error('Training not found')); return; }
        const shotNumber = tr.nextShotNumber;
        tr.nextShotNumber = shotNumber + 1;
        tr.updatedAt = now;
        tx.objectStore('trainings').put(tr);
        shot = {
          id: crypto.randomUUID(),
          trainingId,
          shotNumber,
          x,
          y,
          score: recomputeScore(x, y),
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          } as ShotRecord;
        tx.objectStore('shots').put(shot);
        };
      trGet.onerror = () => reject(trGet.error);
      });
      });
  return shot;
}

// ─── commitShot (§19.1 б) ───────────────────────────────────────────────────

export async function commitShot(
  id: string,
  x: number,
  y: number,
  clientEpoch: number,
): Promise<ShotRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  let updated!: ShotRecord;
  await withReadWrite(db, ['shots'], clientEpoch, (tx) => {
    return new Promise<ShotRecord>((resolve, reject) => {
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(tx.error);
      const get = tx.objectStore('shots').get(id);
      get.onsuccess = () => {
        const s = get.result as ShotRecord;
        if (!s) { reject(new Error('Shot not found')); return; }
        s.x = x;
        s.y = y;
        s.score = recomputeScore(x, y);
        s.status = 'committed';
        s.updatedAt = now;
        updated = s;
        tx.objectStore('shots').put(s);
        };
      get.onerror = () => reject(get.error);
      });
      });
  return updated;
}

// ─── updateCoords ────────────────────────────────────────────────────────────

export async function updateCoords(
  id: string,
  x: number,
  y: number,
  clientEpoch: number,
): Promise<ShotRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  let updated!: ShotRecord;
  await withReadWrite(db, ['shots'], clientEpoch, (tx) => {
    return new Promise<ShotRecord>((resolve, reject) => {
      tx.oncomplete = () => resolve(updated);
      tx.onerror = () => reject(tx.error);
      const get = tx.objectStore('shots').get(id);
      get.onsuccess = () => {
        const s = get.result as ShotRecord;
        if (!s) { reject(new Error('Shot not found')); return; }
        s.x = x;
        s.y = y;
        s.score = recomputeScore(x, y);
        s.updatedAt = now;
        updated = s;
        tx.objectStore('shots').put(s);
        };
      get.onerror = () => reject(get.error);
      });
      });
  return updated;
}

// ─── deleteDraft ─────────────────────────────────────────────────────────────

export async function deleteDraft(id: string, clientEpoch: number): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['shots'], clientEpoch, (tx) => {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const get = tx.objectStore('shots').get(id);
      get.onsuccess = () => {
        const s = get.result as ShotRecord | undefined;
        if (!s) { reject(new Error('Shot not found')); return; }
        if (s.status !== 'draft') {
          tx.abort();
          reject(new Error('Can only delete draft shots'));
          return;
          }
        tx.objectStore('shots').delete(id);
        };
      get.onerror = () => reject(get.error);
      });
      });
}

// ─── deleteCommittedShotForUndo ──────────────────────────────────────────────

export async function deleteCommittedShotForUndo(id: string, clientEpoch: number): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['shots'], clientEpoch, (tx) => new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.objectStore('shots').delete(id);
  }));
}

// ─── listShots ───────────────────────────────────────────────────────────────

export async function listShots(trainingId: string): Promise<ShotRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shots', 'readonly');
    const req = tx.objectStore('shots').index('trainingId').getAll(trainingId);
    req.onsuccess = () =>
      resolve((req.result as ShotRecord[]).sort((a, b) => a.shotNumber - b.shotNumber));
    req.onerror = () => reject(req.error);
    });
}

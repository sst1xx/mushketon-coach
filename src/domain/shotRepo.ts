import { openDB } from '../db/open';
import { withReadWrite } from '../db/tx';
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
        if (tr.completedAt) {
          reject(new Error('Cannot add shot to a completed training'));
          return;
        }

        const isLimited = typeof tr.targetShotCount === 'number' && tr.targetShotCount > 0;
        if (isLimited) {
          const countReq = tx.objectStore('shots').index('trainingId').count(trainingId);
          countReq.onsuccess = () => {
            if (countReq.result >= tr.targetShotCount!) {
              reject(new Error('Training shot limit reached'));
              return;
            }
            proceed();
          };
          countReq.onerror = () => reject(countReq.error);
        } else {
          proceed();
        }

        function proceed() {
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
        }
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

/**
 * Delete a draft shot and, in the same tx, reclaim its shotNumber if it was
 * the highest number issued so far (i.e. no committed/draft shot occupies it
 * or a higher number). This keeps a cancelled-before-commit draft from
 * permanently consuming a shot number. `nextShotNumber` is recomputed from
 * the actual remaining shots (max remaining shotNumber + 1) rather than
 * blindly decremented, so it can never drop below what existing shots
 * require, even under races with concurrent writers.
 */
export async function deleteDraft(id: string, clientEpoch: number): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['shots', 'trainings'], clientEpoch, (tx) => {
    return new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const shotsStore = tx.objectStore('shots');
      const get = shotsStore.get(id);
      get.onsuccess = () => {
        const s = get.result as ShotRecord | undefined;
        if (!s) { reject(new Error('Shot not found')); return; }
        if (s.status !== 'draft') {
          tx.abort();
          reject(new Error('Can only delete draft shots'));
          return;
          }
        shotsStore.delete(id);
        const allReq = shotsStore.index('trainingId').getAll(s.trainingId);
        allReq.onsuccess = () => {
          const remaining = (allReq.result as ShotRecord[]).filter((r) => r.id !== id);
          const maxShotNumber = remaining.reduce((mx, r) => Math.max(mx, r.shotNumber), 0);
          const trGet = tx.objectStore('trainings').get(s.trainingId);
          trGet.onsuccess = () => {
            const tr = trGet.result as TrainingRecord | undefined;
            if (tr) {
              const reclaimedNext = maxShotNumber + 1;
              if (reclaimedNext < tr.nextShotNumber) {
                tr.nextShotNumber = reclaimedNext;
                tx.objectStore('trainings').put(tr);
              }
            }
          };
          trGet.onerror = () => reject(trGet.error);
        };
        allReq.onerror = () => reject(allReq.error);
        };
      get.onerror = () => reject(get.error);
      });
      });
}

// ─── deleteCommittedShotForUndo ──────────────────────────────────────────────

/**
 * Delete a committed shot (used for Undo) and, in the same tx, reclaim its
 * shotNumber if it was the highest number issued so far. `nextShotNumber` is
 * recomputed from the actual remaining shots (max remaining shotNumber + 1)
 * rather than blindly decremented, so it can never drop below what existing
 * shots require, even under races with concurrent writers. This mirrors the
 * reclaim behaviour of `deleteDraft` so that repeated Undo of the most
 * recent shot does not leave gaps in shot numbering.
 */
export async function deleteCommittedShotForUndo(id: string, clientEpoch: number): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['shots', 'trainings'], clientEpoch, (tx) => new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    const shotsStore = tx.objectStore('shots');
    const get = shotsStore.get(id);
    get.onsuccess = () => {
      const s = get.result as ShotRecord | undefined;
      if (!s) { reject(new Error('Shot not found')); return; }
      shotsStore.delete(id);
      const allReq = shotsStore.index('trainingId').getAll(s.trainingId);
      allReq.onsuccess = () => {
        const remaining = (allReq.result as ShotRecord[]).filter((r) => r.id !== id);
        const maxShotNumber = remaining.reduce((mx, r) => Math.max(mx, r.shotNumber), 0);
        const trGet = tx.objectStore('trainings').get(s.trainingId);
        trGet.onsuccess = () => {
          const tr = trGet.result as TrainingRecord | undefined;
          if (tr) {
            const reclaimedNext = maxShotNumber + 1;
            if (reclaimedNext < tr.nextShotNumber) {
              tr.nextShotNumber = reclaimedNext;
              tx.objectStore('trainings').put(tr);
            }
          }
        };
        trGet.onerror = () => reject(trGet.error);
      };
      allReq.onerror = () => reject(allReq.error);
    };
    get.onerror = () => reject(get.error);
  }));
}

// ─── undoLastShot ─────────────────────────────────────────────────────────────

/**
 * Delete the most recently created shot of a training (the one with the
 * highest shotNumber).
 *
 * Returns true when a shot was deleted, false when the training has no shots
 * (no-op). TrainingRecord.nextShotNumber is reclaimed down to
 * `max(remaining shotNumber) + 1` in the same tx as the delete (see
 * `deleteCommittedShotForUndo`), so repeated Undo of the last shot keeps
 * subsequent shot numbers contiguous instead of leaving gaps.
 */
export async function undoLastShot(
  trainingId: string,
  clientEpoch: number,
): Promise<boolean> {
  const current = await listShots(trainingId); // fresh, sorted by shotNumber asc
  if (current.length === 0) return false;
  const target = current[current.length - 1];
  await deleteCommittedShotForUndo(target.id, clientEpoch);
  return true;
}

// ─── getShot ────────────────────────────────────────────────────────────────

export async function getShot(id: string): Promise<ShotRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('shots', 'readonly');
    const req = tx.objectStore('shots').get(id);
    req.onsuccess = () => resolve(req.result as ShotRecord | undefined);
    req.onerror = () => reject(req.error);
  });
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

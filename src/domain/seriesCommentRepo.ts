import { openDB } from '../db/open';
import { withReadWrite } from '../db/tx';
import type { SeriesCommentRecord } from '../db/schema';

/**
 * General (non-shot) remark for a single ПП-3 series (1..6), independent
 * from the exercise-wide GeneralCommentRecord (see PLAN-DIARY-IA.md §3).
 * One record per (trainingId, seriesNumber) pair, keyed by a composite id.
 */

function makeId(trainingId: string, seriesNumber: number): string {
  return `${trainingId}:${seriesNumber}`;
}

// ─── getSeriesComment ─────────────────────────────────────────────────────────

export async function getSeriesComment(
  trainingId: string,
  seriesNumber: number,
): Promise<SeriesCommentRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('seriesComments', 'readonly');
    const req = tx.objectStore('seriesComments').get(makeId(trainingId, seriesNumber));
    req.onsuccess = () => resolve(req.result as SeriesCommentRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ─── listSeriesCommentsByTraining ─────────────────────────────────────────────

export async function listSeriesCommentsByTraining(trainingId: string): Promise<SeriesCommentRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('seriesComments', 'readonly');
    const req = tx.objectStore('seriesComments').index('trainingId').getAll(trainingId);
    req.onsuccess = () =>
      resolve((req.result as SeriesCommentRecord[]).sort((a, b) => a.seriesNumber - b.seriesNumber));
    req.onerror = () => reject(req.error);
  });
}

// ─── listSeriesCommentsByAthlete ───────────────────────────────────────────────

export async function listSeriesCommentsByAthlete(athleteId: string): Promise<SeriesCommentRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('seriesComments', 'readonly');
    const req = tx.objectStore('seriesComments').index('athleteId').getAll(athleteId);
    req.onsuccess = () =>
      resolve((req.result as SeriesCommentRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

// ─── saveSeriesComment ─────────────────────────────────────────────────────────

/**
 * Creates, updates, or deletes a series' general comment depending on
 * `text`: an empty (after trim) text deletes any existing record instead of
 * storing a blank one (same rule as saveGeneralComment).
 */
export async function saveSeriesComment(
  params: { athleteId: string; trainingId: string; seriesNumber: number; text: string },
  clientEpoch: number,
): Promise<SeriesCommentRecord | null> {
  const db = await openDB();
  const now = new Date().toISOString();
  const trimmed = params.text.trim();
  const id = makeId(params.trainingId, params.seriesNumber);
  let result: SeriesCommentRecord | null = null;

  await withReadWrite(db, ['seriesComments'], clientEpoch, (tx) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore('seriesComments');
      const get = store.get(id);
      get.onsuccess = () => {
        const existing = get.result as SeriesCommentRecord | undefined;
        if (!trimmed) {
          if (existing) store.delete(id);
          result = null;
          return;
        }
        const record: SeriesCommentRecord = {
          id,
          athleteId: params.athleteId,
          trainingId: params.trainingId,
          seriesNumber: params.seriesNumber,
          text: trimmed,
          createdAt: existing ? existing.createdAt : now,
          updatedAt: now,
        };
        store.put(record);
        result = record;
      };
      get.onerror = () => reject(get.error);
    }),
  );
  return result;
}

// ─── deleteSeriesComment ────────────────────────────────────────────────────────

export async function deleteSeriesComment(
  trainingId: string,
  seriesNumber: number,
  clientEpoch: number,
): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['seriesComments'], clientEpoch, (tx) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('seriesComments').delete(makeId(trainingId, seriesNumber));
    }),
  );
}

// ─── deleteSeriesCommentsByTraining (cascade helper) ───────────────────────────

/**
 * Deletes all series comments of a training within an already-open
 * readwrite transaction that includes the 'seriesComments' store (used by
 * trainingRepo.deleteTraining's cascade — see PLAN-DIARY-IA.md §3).
 */
export function cascadeDeleteSeriesCommentsInTx(tx: IDBTransaction, trainingId: string): void {
  const req = tx.objectStore('seriesComments').index('trainingId').getAll(trainingId);
  req.onsuccess = (e: any) => {
    for (const sc of e.target!.result as SeriesCommentRecord[]) {
      tx.objectStore('seriesComments').delete(sc.id);
    }
  };
}

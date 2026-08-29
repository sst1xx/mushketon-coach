import { openDB } from '../db/open';
import { withReadWrite } from '../db/tx';
import type { GeneralCommentRecord } from '../db/schema';

/**
 * General (non-shot) remark for a whole self-started training element
 * (a series or a ПП-3 exercise). One record per trainingId — the primary
 * key of the `generalComments` store is `trainingId` itself.
 */

// ─── getGeneralComment ────────────────────────────────────────────────────────

export async function getGeneralComment(trainingId: string): Promise<GeneralCommentRecord | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('generalComments', 'readonly');
    const req = tx.objectStore('generalComments').get(trainingId);
    req.onsuccess = () => resolve(req.result as GeneralCommentRecord | undefined);
    req.onerror = () => reject(req.error);
  });
}

// ─── listGeneralCommentsByAthlete ─────────────────────────────────────────────

export async function listGeneralCommentsByAthlete(athleteId: string): Promise<GeneralCommentRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('generalComments', 'readonly');
    const req = tx.objectStore('generalComments').index('athleteId').getAll(athleteId);
    req.onsuccess = () =>
      resolve((req.result as GeneralCommentRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

// ─── saveGeneralComment ───────────────────────────────────────────────────────

/**
 * Creates, updates, or deletes the training's general comment depending on
 * `text`: an empty (after trim) text deletes any existing record instead of
 * storing a blank one. Returns the saved record, or `null` if it was deleted
 * / never existed.
 */
export async function saveGeneralComment(
  params: { athleteId: string; trainingId: string; text: string },
  clientEpoch: number,
): Promise<GeneralCommentRecord | null> {
  const db = await openDB();
  const now = new Date().toISOString();
  const trimmed = params.text.trim();
  let result: GeneralCommentRecord | null = null;

  await withReadWrite(db, ['generalComments'], clientEpoch, (tx) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const store = tx.objectStore('generalComments');
      const get = store.get(params.trainingId);
      get.onsuccess = () => {
        const existing = get.result as GeneralCommentRecord | undefined;
        if (!trimmed) {
          if (existing) store.delete(params.trainingId);
          result = null;
          return;
        }
        const record: GeneralCommentRecord = {
          trainingId: params.trainingId,
          athleteId: params.athleteId,
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

// ─── deleteGeneralComment ─────────────────────────────────────────────────────

export async function deleteGeneralComment(trainingId: string, clientEpoch: number): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['generalComments'], clientEpoch, (tx) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('generalComments').delete(trainingId);
    }),
  );
}

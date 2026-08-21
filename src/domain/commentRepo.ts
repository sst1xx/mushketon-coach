import { openDB } from '../db/open';
import { withReadWrite } from '../db/tx';
import type { CommentRecord } from '../db/schema';

// ─── createComment ────────────────────────────────────────────────────────────

export async function createComment(
  params: { athleteId: string; trainingId: string; shotId: string; text: string },
  clientEpoch: number,
): Promise<CommentRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  const record: CommentRecord = {
    id: crypto.randomUUID(),
    athleteId: params.athleteId,
    trainingId: params.trainingId,
    shotId: params.shotId,
    text: params.text,
    createdAt: now,
    updatedAt: now,
  };
  await withReadWrite(db, ['comments'], clientEpoch, (tx) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('comments').put(record);
    }),
  );
  return record;
}

// ─── listCommentsByAthlete ────────────────────────────────────────────────────

export async function listCommentsByAthlete(athleteId: string): Promise<CommentRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('comments', 'readonly');
    const req = tx.objectStore('comments').index('athleteId').getAll(athleteId);
    req.onsuccess = () =>
      resolve((req.result as CommentRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

// ─── listCommentsByShot ───────────────────────────────────────────────────────

export async function listCommentsByShot(shotId: string): Promise<CommentRecord[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('comments', 'readonly');
    const req = tx.objectStore('comments').index('shotId').getAll(shotId);
    req.onsuccess = () =>
      resolve((req.result as CommentRecord[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    req.onerror = () => reject(req.error);
  });
}

// ─── updateComment ────────────────────────────────────────────────────────────

export async function updateComment(
  id: string,
  text: string,
  clientEpoch: number,
): Promise<CommentRecord> {
  const db = await openDB();
  const now = new Date().toISOString();
  let updated!: CommentRecord;
  await withReadWrite(db, ['comments'], clientEpoch, (tx) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      const get = tx.objectStore('comments').get(id);
      get.onsuccess = () => {
        const c = get.result as CommentRecord | undefined;
        if (!c) { reject(new Error('Comment not found')); return; }
        c.text = text;
        c.updatedAt = now;
        updated = c;
        tx.objectStore('comments').put(c);
      };
      get.onerror = () => reject(get.error);
    }),
  );
  return updated;
}

// ─── deleteComment ────────────────────────────────────────────────────────────

export async function deleteComment(id: string, clientEpoch: number): Promise<void> {
  const db = await openDB();
  await withReadWrite(db, ['comments'], clientEpoch, (tx) =>
    new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore('comments').delete(id);
    }),
  );
}

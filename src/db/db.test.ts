import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from './open';
import { initSettings, getSetting, setSetting } from './settings';
import { runStartupCleanup } from './startup';
import { withReadWrite, readEpoch, DataEpochMismatchError } from './tx';
import { SCORING_VERSION } from '../scoring';

// ── helpers ──────────────────────────────────────────────────────────────────

async function mkAthlete(db: IDBDatabase, id: string, name: string) {
  const now = new Date().toISOString();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('athletes', 'readwrite');
    tx.objectStore('athletes').put({ id, name, createdAt: now, updatedAt: now });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
     });
}

async function mkTraining(db: IDBDatabase, id: string, athleteId: string) {
  const now = new Date().toISOString();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('trainings', 'readwrite');
    tx.objectStore('trainings').put({
      id, athleteId, startedAt: now, updatedAt: now,
      completedAt: null, nextShotNumber: 0,
     });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
     });
}

async function mkShot(
  db: IDBDatabase,
  id: string,
  trainingId: string,
  x: number,
  y: number,
  score_: number,
  status: 'draft' | 'committed',
) {
  const now = new Date().toISOString();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('shots', 'readwrite');
    tx.objectStore('shots').put({
      id, trainingId, shotNumber: 1,
      x, y, score: score_, status, createdAt: now, updatedAt: now,
     });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
     });
}

async function countStore(db: IDBDatabase, store: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
     });
}

async function getShot(db: IDBDatabase, id: string) {
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction('shots', 'readonly');
    const req = tx.objectStore('shots').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
     });
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('IndexedDB persistence layer', () => {
   let db: IDBDatabase;

  beforeEach(async () => {
     // fake-indexeddb/auto persists across tests in same process —
    // delete the DB to start fresh every time.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('musketoon-coach');
       req.onsuccess = () => resolve();
       req.onerror = () => reject(req.error);
        });
      db = await openDB();
      await initSettings(db);
      });

  afterEach(() => {
    closeDB();
     });

    // ── 1: schema ──
  it('all 5 stores exist; shots has trainingId index; trainings has athleteId index; comments has indices', async () => {
    expect(db.objectStoreNames.contains('athletes')).toBe(true);
    expect(db.objectStoreNames.contains('trainings')).toBe(true);
    expect(db.objectStoreNames.contains('shots')).toBe(true);
    expect(db.objectStoreNames.contains('comments')).toBe(true);
    expect(db.objectStoreNames.contains('settings')).toBe(true);
    const shotsStore = db.transaction('shots', 'readonly').objectStore('shots');
    expect(shotsStore.indexNames.contains('trainingId')).toBe(true);
    const trainingsStore = db.transaction('trainings', 'readonly').objectStore('trainings');
    expect(trainingsStore.indexNames.contains('athleteId')).toBe(true);
    const commentsStore = db.transaction('comments', 'readonly').objectStore('comments');
    expect(commentsStore.indexNames.contains('athleteId')).toBe(true);
    expect(commentsStore.indexNames.contains('trainingId')).toBe(true);
    expect(commentsStore.indexNames.contains('shotId')).toBe(true);
  });

  // ── 1b: migration v1 -> v2 preserves data and creates comments store ──
  it('migrates from v1 to v2 preserving existing data and creating comments store', async () => {
    closeDB();
    // Delete database to set up a pure v1 DB manually
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('musketoon-coach');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Create v1 DB and insert data
    const dbV1 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('musketoon-coach', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('athletes', { keyPath: 'id' });
        const tr = d.createObjectStore('trainings', { keyPath: 'id' });
        tr.createIndex('athleteId', 'athleteId', { unique: false });
        const sh = d.createObjectStore('shots', { keyPath: 'id' });
        sh.createIndex('trainingId', 'trainingId', { unique: false });
        d.createObjectStore('settings', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await mkAthlete(dbV1, 'a-old', 'Old Athlete');
    await mkTraining(dbV1, 't-old', 'a-old');
    await mkShot(dbV1, 's-old', 't-old', 100, 200, 105, 'committed');
    dbV1.close();

    // Now open via openDB() which targets DB_VERSION (2)
    const dbV2 = await openDB();
    expect(dbV2.version).toBe(2);
    expect(dbV2.objectStoreNames.contains('comments')).toBe(true);

    // Existing data preserved
    expect(await countStore(dbV2, 'athletes')).toBe(1);
    expect(await countStore(dbV2, 'trainings')).toBe(1);
    expect(await countStore(dbV2, 'shots')).toBe(1);
    const shot = await getShot(dbV2, 's-old');
    expect(shot).toBeDefined();
    expect(shot.score).toBe(105);
  });

    // ── 2: initSettings idempotent ──
  it('initSettings is idempotent (calling twice leaves correct values)', async () => {
    await initSettings(db);
    expect(await getSetting(db, 'SCORING_VERSION')).toBe(SCORING_VERSION);
    expect(await getSetting(db, 'dataEpoch')).toBe(1);
      });

    // ── 3: draft deleted, committed kept ──
  it('runStartupCleanup deletes draft shot, keeps committed shot', async () => {
    await mkAthlete(db, 'a1', 'Test');
    await mkTraining(db, 't1', 'a1');
    await mkShot(db, 's-draft', 't1', 100, 100, 90, 'draft');
    await mkShot(db, 's-comm', 't1', 100, 100, 90, 'committed');

    await runStartupCleanup(db);
    expect(await countStore(db, 'shots')).toBe(1);
    expect(await getShot(db, 's-draft')).toBeUndefined();
    expect(await getShot(db, 's-comm')).not.toBeUndefined();
     });

    // ── 4: orphan shot deleted ──
  it('runStartupCleanup deletes orphan shot (bad trainingId)', async () => {
    await mkAthlete(db, 'a1', 'Test');
    await mkTraining(db, 't1', 'a1');
    await mkShot(db, 's-orphan', 't-nonexistent', 100, 100, 90, 'committed');

    await runStartupCleanup(db);
    expect(await countStore(db, 'shots')).toBe(0);
     });

    // ── 5: orphan training deleted ──
  it('runStartupCleanup deletes orphan training (bad athleteId)', async () => {
    await mkAthlete(db, 'a1', 'Test');
    await mkTraining(db, 't-orphan', 'a-nonexistent');

    await runStartupCleanup(db);
    expect(await countStore(db, 'trainings')).toBe(0);
     });

    // ── 6: rescore on version mismatch ──
  it('runStartupCleanup rescores committed shot when SCORING_VERSION mismatches', async () => {
    const { score } = await import('../scoring');

    await mkAthlete(db, 'a1', 'Test');
    await mkTraining(db, 't1', 'a1');
    const x = 300, y = 400;
    await mkShot(db, 's1', 't1', x, y, 0, 'committed'); // deliberately wrong score
    await setSetting(db, 'SCORING_VERSION', 0);           // old version

    await runStartupCleanup(db);
    const shot = await getShot(db, 's1');
    expect(shot.score).toBe(score(x, y));
    expect(await getSetting(db, 'SCORING_VERSION')).toBe(SCORING_VERSION);
     });

    // ── 7: withReadWrite succeeds when epoch matches ──
  it('withReadWrite succeeds when epoch matches', async () => {
    const epoch = (await readEpoch(db)) as number;
    const result = await withReadWrite(db, ['shots'], epoch, (tx) => {
       return new Promise<string>((resolve, reject) => {
        tx.objectStore('shots').put({
          id: 's1', trainingId: 't1', shotNumber: 1,
          x: 0, y: 0, score: 109, status: 'committed',
          createdAt: '', updatedAt: '',
          });
        tx.oncomplete = () => resolve('ok');
        tx.onerror = () => reject(tx.error);
          });
          });
    expect(result).toBe('ok');
    expect(await countStore(db, 'shots')).toBe(1);
     });

    // ── 8: withReadWrite throws DataEpochMismatchError when wrong ──
  it('withReadWrite throws DataEpochMismatchError when epoch is wrong', async () => {
    let threw = false;
    try {
      await withReadWrite(db, ['shots'], 999, () => 'should not run');
       } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(DataEpochMismatchError);
        }
     expect(threw).toBe(true);
    expect(await countStore(db, 'shots')).toBe(0);
     });
});

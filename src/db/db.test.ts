import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from './open';
import { initSettings, getSetting, setSetting } from './settings';
import { runStartupCleanup } from './startup';
import { withReadWrite, readEpoch, DataEpochMismatchError } from './tx';
import { SCORING_VERSION } from '../scoring';
import { DB_VERSION } from './schema';

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
  shotNumber = 1,
) {
  const now = new Date().toISOString();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('shots', 'readwrite');
    tx.objectStore('shots').put({
      id, trainingId, shotNumber,
      x, y, score: score_, status, createdAt: now, updatedAt: now,
     });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
     });
}

async function setNextShotNumber(db: IDBDatabase, trainingId: string, nextShotNumber: number) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('trainings', 'readwrite');
    const store = tx.objectStore('trainings');
    const get = store.get(trainingId);
    get.onsuccess = () => {
      const tr = get.result;
      tr.nextShotNumber = nextShotNumber;
      store.put(tr);
    };
    get.onerror = () => reject(get.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getTrainingRecord(db: IDBDatabase, id: string) {
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction('trainings', 'readonly');
    const req = tx.objectStore('trainings').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

    // Now open via openDB() which targets the current DB_VERSION
    const dbV2 = await openDB();
    expect(dbV2.version).toBe(DB_VERSION);
    expect(dbV2.objectStoreNames.contains('comments')).toBe(true);
    expect(dbV2.objectStoreNames.contains('generalComments')).toBe(true);
    expect(dbV2.objectStoreNames.contains('seriesComments')).toBe(true);

    // Existing data preserved
    expect(await countStore(dbV2, 'athletes')).toBe(1);
    expect(await countStore(dbV2, 'trainings')).toBe(1);
    expect(await countStore(dbV2, 'shots')).toBe(1);
    const shot = await getShot(dbV2, 's-old');
    expect(shot).toBeDefined();
    expect(shot.score).toBe(105);
  });

  // ── 1c: migration to v4 is additive — opens an existing v3 DB (with
  // generalComments but no seriesComments) without errors, creating the new
  // store empty (see PLAN-DIARY-IA.md §10) ──
  it('migrates an existing v3 DB (no seriesComments store) to v4 without errors, creating seriesComments empty', async () => {
    closeDB();
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase('musketoon-coach');
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    const dbV3 = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('musketoon-coach', 3);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('athletes', { keyPath: 'id' });
        const tr = d.createObjectStore('trainings', { keyPath: 'id' });
        tr.createIndex('athleteId', 'athleteId', { unique: false });
        const sh = d.createObjectStore('shots', { keyPath: 'id' });
        sh.createIndex('trainingId', 'trainingId', { unique: false });
        d.createObjectStore('settings', { keyPath: 'key' });
        const cm = d.createObjectStore('comments', { keyPath: 'id' });
        cm.createIndex('athleteId', 'athleteId', { unique: false });
        cm.createIndex('trainingId', 'trainingId', { unique: false });
        cm.createIndex('shotId', 'shotId', { unique: false });
        const gc = d.createObjectStore('generalComments', { keyPath: 'trainingId' });
        gc.createIndex('athleteId', 'athleteId', { unique: false });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await mkAthlete(dbV3, 'a-old2', 'Old Athlete 2');
    await mkTraining(dbV3, 't-old2', 'a-old2');
    dbV3.close();

    const dbV4 = await openDB();
    expect(dbV4.version).toBe(DB_VERSION);
    expect(dbV4.objectStoreNames.contains('seriesComments')).toBe(true);
    expect(await countStore(dbV4, 'seriesComments')).toBe(0);
    expect(await countStore(dbV4, 'athletes')).toBe(1);
    expect(await countStore(dbV4, 'trainings')).toBe(1);
  });

    // ── 2: initSettings idempotent ──
  it('initSettings is idempotent (calling twice leaves correct values)', async () => {
    await initSettings(db);
    expect(await getSetting(db, 'SCORING_VERSION')).toBe(SCORING_VERSION);
    expect(await getSetting(db, 'dataEpoch')).toBe(1);
    expect(await getSetting(db, 'themeMode')).toBe('light');
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

    // ── 3b: startup cleanup reclaims nextShotNumber after deleting leftover drafts ──
  it('runStartupCleanup deletes leftover drafts (11..14) and reclaims nextShotNumber so the next createDraft gets 11, not 15', async () => {
    await mkAthlete(db, 'a1', 'Test');
    await mkTraining(db, 't1', 'a1');
    for (let i = 1; i <= 10; i++) {
      await mkShot(db, `s-committed-${i}`, 't1', 100 + i, 200, 90, 'committed', i);
    }
    for (let i = 11; i <= 14; i++) {
      await mkShot(db, `s-draft-${i}`, 't1', 100 + i, 200, 90, 'draft', i);
    }
    await setNextShotNumber(db, 't1', 15);

    await runStartupCleanup(db);
    expect(await countStore(db, 'shots')).toBe(10);
    for (let i = 11; i <= 14; i++) {
      expect(await getShot(db, `s-draft-${i}`)).toBeUndefined();
    }

    const tr = await getTrainingRecord(db, 't1');
    expect(tr.nextShotNumber).toBe(11);

    const { readEpoch } = await import('./tx');
    const { createDraft } = await import('../domain/shotRepo');
    const epoch = (await readEpoch(db)) as number;
    const nextDraft = await createDraft('t1', 500, 600, epoch);
    expect(nextDraft.shotNumber).toBe(11);
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

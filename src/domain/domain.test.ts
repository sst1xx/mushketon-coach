import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from '../db/open';
import { initSettings, getSetting } from '../db/settings';
import {
   createAthlete,
   listAthletes,
   deleteAthlete,
   createTraining,
   listTrainings,
   getTraining,
   deleteTraining,
   createDraft,
   commitShot,
   updateCoords,
   deleteDraft,
   deleteCommittedShotForUndo,
   undoLastShot,
   listShots,
   exportBackup,
   validateBackup,
   importBackup,
   destroyBC,
 } from './index';
import { DB_NAME } from '../db/schema';

async function setup() {
    // Delete any leftover DB from a previous test
   await new Promise<void>((resolve, reject) => {
     const req = indexedDB.deleteDatabase(DB_NAME);
     req.onsuccess = () => resolve();
     req.onerror = () => reject(req.error);
     req.onblocked = () => resolve(); // unblock by allowing
       });
   const db = await openDB();
   await initSettings(db);
   const epoch = await getSetting(db, 'dataEpoch');
   return epoch ?? 1;
   }

async function teardown() {
   destroyBC();
   closeDB();
}

// ─── athleteRepo ─────────────────────────────────────────────────────────────

describe('athleteRepo', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('createAthlete creates a record with correct fields', async () => {
    const a = await createAthlete('Test');
    expect(a.id).toBeDefined();
    expect(a.name).toBe('Test');
   });

  it('listAthletes returns sorted by name', async () => {
    await createAthlete('Charlie');
    await createAthlete('Alpha');
    const list = await listAthletes();
    expect(list.map((a) => a.name)).toEqual(['Alpha', 'Charlie']);
      });

  it('deleteAthlete cascade-deletes trainings and shots', async () => {
    const epoch = await setup();
    const a = await createAthlete('Test');
    const t = await createTraining(a.id, epoch);
    await createDraft(t.id, 100, 200, epoch);
    await deleteAthlete(a.id, epoch);
    expect(await listAthletes()).toHaveLength(0);
    expect(await listTrainings(a.id)).toHaveLength(0);
    expect(await listShots(t.id)).toHaveLength(0);
    });
});

// ─── trainingRepo ────────────────────────────────────────────────────────────

describe('trainingRepo', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('createTraining creates with nextShotNumber=1', async () => {
    const epoch = await setup();
    const a = await createAthlete('T');
    const t = await createTraining(a.id, epoch);
    expect(t.nextShotNumber).toBe(1);
    expect(t.completedAt).toBeNull();
    });

  it('createTraining allows multiple active trainings', async () => {
    const epoch = await setup();
    const a = await createAthlete('T');
    const t1 = await createTraining(a.id, epoch);
    const t2 = await createTraining(a.id, epoch);
    expect((await getTraining(t1.id))!.completedAt).toBeNull();
    expect(t2.completedAt).toBeNull();
  });
});

// ─── shotRepo ────────────────────────────────────────────────────────────────

describe('shotRepo', () => {
  let epoch: number;
  let trainingId: string;
   beforeEach(async () => {
     epoch = await setup();
     const a = await createAthlete('S');
     const t = await createTraining(a.id, epoch);
     trainingId = t.id;
     });
  afterEach(teardown);

  it('createDraft increments nextShotNumber and creates draft shot', async () => {
    const s1 = await createDraft(trainingId, 100, 200, epoch);
    expect(s1.shotNumber).toBe(1);
    expect(s1.status).toBe('draft');
    const s2 = await createDraft(trainingId, 300, 400, epoch);
    expect(s2.shotNumber).toBe(2);
    expect(await listShots(trainingId)).toHaveLength(2);
    });

  it('commitShot sets status=committed and recalculates score', async () => {
    const s1 = await createDraft(trainingId, 100, 200, epoch);
    const s2 = await commitShot(s1.id, 100, 200, epoch);
    expect(s2.status).toBe('committed');
    });

  it('deleteDraft removes a draft shot; throws for committed', async () => {
    const s1 = await createDraft(trainingId, 100, 200, epoch);
    await deleteDraft(s1.id, epoch);
    expect(await listShots(trainingId)).toHaveLength(0);

       // committed shot cannot be deleted
    const s2 = await createDraft(trainingId, 100, 200, epoch);
    await commitShot(s2.id, 100, 200, epoch);
    await expect(deleteDraft(s2.id, epoch)).rejects.toThrow(/draft/i);
      });

  it('undo deletes the most recently created shot even after it was moved (create->move->undo)', async () => {
    const s1 = await createDraft(trainingId, 100, 200, epoch);
    await commitShot(s1.id, 100, 200, epoch);
    const s2 = await createDraft(trainingId, 300, 400, epoch);
    await commitShot(s2.id, 300, 400, epoch);

    // Edit (move) the most recent shot after creation — must not block undo
    await updateCoords(s2.id, 350, 450, epoch);
    await deleteCommittedShotForUndo(s2.id, epoch);

    const remaining = await listShots(trainingId);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].shotNumber).toBe(1);
  });

  it('multiple undo deletes successive last-created shots until none remain', async () => {
    const created: Array<{ id: string; shotNumber: number }> = [];
    for (let i = 0; i < 3; i++) {
      const d = await createDraft(trainingId, 100 + i * 10, 200 + i * 10, epoch);
      const c = await commitShot(d.id, 100 + i * 10, 200 + i * 10, epoch);
      created.push({ id: c.id, shotNumber: c.shotNumber });
    }

    // Undo in reverse order (last created first), until empty
    for (let i = created.length - 1; i >= 0; i--) {
      await deleteCommittedShotForUndo(created[i].id, epoch);
      expect(await listShots(trainingId)).toHaveLength(i);
    }
    expect(await listShots(trainingId)).toHaveLength(0);
  });

  it('undoLastShot: sequential undo works LIFO until the training is empty', async () => {
    for (let i = 0; i < 3; i++) {
      const d = await createDraft(trainingId, 100 + i * 10, 200 + i * 10, epoch);
      await commitShot(d.id, 100 + i * 10, 200 + i * 10, epoch);
    }
    expect(await listShots(trainingId)).toHaveLength(3);

    // Each undo removes exactly the most recently created shot
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect((await listShots(trainingId)).map((s) => s.shotNumber)).toEqual([1, 2]);
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect((await listShots(trainingId)).map((s) => s.shotNumber)).toEqual([1]);
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect(await listShots(trainingId)).toHaveLength(0);

    // Empty state: no-op, reports failure
    expect(await undoLastShot(trainingId, epoch)).toBe(false);
  });

  it('undoLastShot does not renumber the monotonic nextShotNumber counter', async () => {
    for (let i = 0; i < 3; i++) {
      const d = await createDraft(trainingId, 100 + i * 10, 200 + i * 10, epoch);
      await commitShot(d.id, 100 + i * 10, 200 + i * 10, epoch);
    }
    const before = (await getTraining(trainingId))!.nextShotNumber;
    expect(before).toBe(4);

    // Undo everything
    while (await undoLastShot(trainingId, epoch)) { /* drain */ }
    expect(await listShots(trainingId)).toHaveLength(0);

    // Counter is monotonic — never decremented by undo
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(before);
  });
});

// ─── backupService ───────────────────────────────────────────────────────────

describe('backupService', () => {
  beforeEach(setup);
  afterEach(teardown);

  it('exportBackup → importBackup → exportBackup: second equals first (except exportedAt)', async () => {
    const epoch = await setup();
    const a = await createAthlete('BkTest');
    const t = await createTraining(a.id, epoch);
    const s = await createDraft(t.id, 0, 0, epoch);
    await commitShot(s.id, 0, 0, epoch);

     const b1 = await exportBackup();
    expect(b1.athletes).toHaveLength(1);
    expect(b1.trainings).toHaveLength(1);
    expect(b1.shots).toHaveLength(1);
    expect(b1.shots[0].status).toBe('committed');

     // Import into fresh DB
    await importBackup(b1);
    const b2 = await exportBackup();
    expect(b2.athletes[0].id).toBe(b1.athletes[0].id);
    expect(b2.trainings[0].id).toBe(b1.trainings[0].id);
    expect(b2.shots[0].id).toBe(b1.shots[0].id);
    });

  it('validateBackup rejects duplicate shotNumber', () => {
     const now = new Date().toISOString();
    const fake = {
        version: 1,
        exportedAt: now,
        athletes: [{ id: 'a1', name: 'X', createdAt: now, updatedAt: now }],
        trainings: [{ id: 't1', athleteId: 'a1', startedAt: now, updatedAt: now, completedAt: null, nextShotNumber: 3 }],
        shots: [
           { id: 's1', trainingId: 't1', shotNumber: 1, x: 0, y: 0, score: 109, status: 'committed', createdAt: now, updatedAt: now },
            { id: 's2', trainingId: 't1', shotNumber: 1, x: 1, y: 1, score: 109, status: 'committed', createdAt: now, updatedAt: now },
            ],
        settings: { SCORING_VERSION: 1, dataEpoch: 1, storagePersisted: null, lastBackupAt: null },
         };
    expect(() => validateBackup(fake)).toThrow(/Duplicate shotNumber/i);
    });

  it('validateBackup rejects draft shot in backup', () => {
     const now = new Date().toISOString();
    const fake = {
        version: 1,
        exportedAt: now,
        athletes: [{ id: 'a1', name: 'X', createdAt: now, updatedAt: now }],
        trainings: [{ id: 't1', athleteId: 'a1', startedAt: now, updatedAt: now, completedAt: null, nextShotNumber: 2 }],
        shots: [
          { id: 's1', trainingId: 't1', shotNumber: 1, x: 0, y: 0, score: 109, status: 'draft', createdAt: now, updatedAt: now },
          ],
        settings: { SCORING_VERSION: 1, dataEpoch: 1, storagePersisted: null, lastBackupAt: null },
         };
    expect(() => validateBackup(fake)).toThrow(/Non-committed shot/i);
    });

  it('validateBackup rejects unknown settings key', () => {
     const now = new Date().toISOString();
    const fake = {
        version: 1,
        exportedAt: now,
        athletes: [],
        trainings: [],
        shots: [],
        settings: { SCORING_VERSION: 1, dataEpoch: 1, storagePersisted: null, lastBackupAt: null, UNKNOWN: 'x' },
         };
    expect(() => validateBackup(fake)).toThrow(/Unknown settings key/i);
    });
});

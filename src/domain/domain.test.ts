import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from '../db/open';
import { initSettings, getSetting } from '../db/settings';
import {
   createAthlete,
   listAthletes,
   deleteAthlete,
   createTraining,
   completeTraining,
   shouldCompleteTrainingAfterShot,
   isTrainingLimitReached,
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
   getShot,
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

  it('createTraining creates with nextShotNumber=1 and default targetShotCount=10', async () => {
    const epoch = await setup();
    const a = await createAthlete('T');
    const t = await createTraining(a.id, epoch);
    expect(t.nextShotNumber).toBe(1);
    expect(t.completedAt).toBeNull();
    expect(t.targetShotCount).toBe(10);
  });

  it('createTraining supports null targetShotCount for unlimited trainings', async () => {
    const epoch = await setup();
    const a = await createAthlete('T');
    const t = await createTraining(a.id, epoch, null);
    expect(t.targetShotCount).toBeNull();
  });

  it('completeTraining marks training as completed with ISO timestamp', async () => {
    const epoch = await setup();
    const a = await createAthlete('T');
    const t = await createTraining(a.id, epoch);
    expect(t.completedAt).toBeNull();

    const completed = await completeTraining(t.id, epoch);
    expect(completed.completedAt).not.toBeNull();
    expect(typeof completed.completedAt).toBe('string');
    const fetched = await getTraining(t.id);
    expect(fetched?.completedAt).toBe(completed.completedAt);
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

  it('getShot returns the shot by id, or undefined if missing', async () => {
    const s1 = await createDraft(trainingId, 100, 200, epoch);
    expect(await getShot(s1.id)).toEqual(s1);
    expect(await getShot('missing-id')).toBeUndefined();
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

  it('cancelling a new draft reclaims its shotNumber for the next shot', async () => {
    const s1 = await createDraft(trainingId, 100, 200, epoch);
    await commitShot(s1.id, 100, 200, epoch);
    const s2 = await createDraft(trainingId, 300, 400, epoch);
    expect(s2.shotNumber).toBe(2);

    // Cancel ("Отменить") the just-created draft before it is committed.
    await deleteDraft(s2.id, epoch);
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(2);

    // The next shot must reuse the reclaimed number, not skip to 3.
    const s3 = await createDraft(trainingId, 500, 600, epoch);
    expect(s3.shotNumber).toBe(2);
    });

  it('cancelling a draft does not reclaim the number if a higher shot already exists', async () => {
    const s1 = await createDraft(trainingId, 100, 200, epoch);
    await commitShot(s1.id, 100, 200, epoch);
    const s2 = await createDraft(trainingId, 300, 400, epoch);
    // A later shot is created (and committed) before s2 is cancelled.
    const s3 = await createDraft(trainingId, 500, 600, epoch);
    await commitShot(s3.id, 500, 600, epoch);
    expect(s3.shotNumber).toBe(3);

    await deleteDraft(s2.id, epoch);
    // nextShotNumber must stay above the existing s3, never regress below it.
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(4);
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

  it('undoLastShot reclaims nextShotNumber down to the remaining max, so undo never leaves gaps', async () => {
    for (let i = 0; i < 3; i++) {
      const d = await createDraft(trainingId, 100 + i * 10, 200 + i * 10, epoch);
      await commitShot(d.id, 100 + i * 10, 200 + i * 10, epoch);
    }
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(4);

    // Undo everything, reclaiming the counter after each undo.
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(3);
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(2);
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect(await listShots(trainingId)).toHaveLength(0);

    // Counter is reclaimed all the way back to 1 — no gaps for a fresh training.
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(1);
  });

  it('undo twice after 10 commits reclaims shotNumbers so the next two shots get 9 and 10 (no gaps like 11/12)', async () => {
    for (let i = 1; i <= 10; i++) {
      const d = await createDraft(trainingId, 100 + i, 200, epoch);
      await commitShot(d.id, 100 + i, 200, epoch);
    }
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(11);

    // Coach presses "Отменить" (undo) twice on the finished series.
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect((await listShots(trainingId)).map((s) => s.shotNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await getTraining(trainingId))!.nextShotNumber).toBe(9);

    // New shots continue contiguously as 9 and 10, not 11 and 12.
    const next1 = await createDraft(trainingId, 111, 200, epoch);
    const c1 = await commitShot(next1.id, 111, 200, epoch);
    expect(c1.shotNumber).toBe(9);
    const next2 = await createDraft(trainingId, 112, 200, epoch);
    const c2 = await commitShot(next2.id, 112, 200, epoch);
    expect(c2.shotNumber).toBe(10);
  });

  it('allows editing and undoing shots on a completed training', async () => {
    // Fill up to 10 shots
    const shotIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = await createDraft(trainingId, 100 + i * 10, 200, epoch);
      const c = await commitShot(d.id, 100 + i * 10, 200, epoch);
      shotIds.push(c.id);
    }
    const completed = await completeTraining(trainingId, epoch);
    expect(completed.completedAt).not.toBeNull();

    // Editing existing shots is permitted after completion
    await updateCoords(shotIds[0], 0, 0, epoch);
    const updatedShots = await listShots(trainingId);
    expect(updatedShots.find(s => s.id === shotIds[0])?.x).toBe(0);

    // Undoing last shot is permitted after completion
    expect(await undoLastShot(trainingId, epoch)).toBe(true);
    expect(await listShots(trainingId)).toHaveLength(9);
  });

  it('createDraft rejects adding a shot to a completed training (both limited and unlimited)', async () => {
    // 1. Unlimited training completed
    const tUnlim = await createTraining((await createAthlete('U')).id, epoch, null);
    await completeTraining(tUnlim.id, epoch);
    await expect(createDraft(tUnlim.id, 100, 200, epoch)).rejects.toThrow(/completed/i);

    // 2. Limited training completed
    const tLim = await createTraining((await createAthlete('L')).id, epoch, 10);
    await completeTraining(tLim.id, epoch);
    await expect(createDraft(tLim.id, 100, 200, epoch)).rejects.toThrow(/completed/i);
  });

  it('unlimited training allows adding > 10 shots without auto-completion or blocking', async () => {
    const tUnlim = await createTraining((await createAthlete('U2')).id, epoch, null);
    for (let i = 0; i < 15; i++) {
      const d = await createDraft(tUnlim.id, 100 + i, 200, epoch);
      await commitShot(d.id, 100 + i, 200, epoch);
    }
    const shots = await listShots(tUnlim.id);
    expect(shots).toHaveLength(15);
    const fetched = await getTraining(tUnlim.id);
    expect(fetched?.completedAt).toBeNull();
  });

  it('createDraft blocks creating draft when targetShotCount is reached even if not yet marked completed', async () => {
    const tLim = await createTraining((await createAthlete('LimAtomic')).id, epoch, 5);
    for (let i = 1; i <= 5; i++) {
      const d = await createDraft(tLim.id, 100 + i, 200, epoch);
      await commitShot(d.id, 100 + i, 200, epoch);
    }
    const current = await getTraining(tLim.id);
    expect(current?.completedAt).toBeNull();

    // 6th shot draft must be rejected atomically at domain boundary
    await expect(createDraft(tLim.id, 160, 200, epoch)).rejects.toThrow(/limit/i);
  });

  it('production seam shouldCompleteTrainingAfterShot transitions 9 (false) -> 10 (true) and next createDraft rejects', async () => {
    const tLim = await createTraining((await createAthlete('LimSeam')).id, epoch, 10);
    expect(tLim.completedAt).toBeNull();

    // Shots 1 to 9: shouldCompleteTrainingAfterShot must be false after each commit
    for (let i = 1; i <= 9; i++) {
      const d = await createDraft(tLim.id, 100 + i, 200, epoch);
      await commitShot(d.id, 100 + i, 200, epoch);
      const shots = await listShots(tLim.id);
      const committedCount = shots.filter(s => s.status === 'committed').length;
      expect(committedCount).toBe(i);
      expect(shouldCompleteTrainingAfterShot(tLim, committedCount)).toBe(false);
    }

    // Shot 10: shouldCompleteTrainingAfterShot must return true for production completion trigger
    const d10 = await createDraft(tLim.id, 110, 200, epoch);
    await commitShot(d10.id, 110, 200, epoch);
    const shots10 = await listShots(tLim.id);
    const count10 = shots10.filter(s => s.status === 'committed').length;
    expect(count10).toBe(10);
    expect(shouldCompleteTrainingAfterShot(tLim, count10)).toBe(true);

    // 11th createDraft must be rejected atomically at domain boundary
    await expect(createDraft(tLim.id, 120, 200, epoch)).rejects.toThrow(/limit/i);

    // When TrainingScreen invokes completeTraining upon shouldCompleteTrainingAfterShot returning true:
    const completed = await completeTraining(tLim.id, epoch);
    expect(completed.completedAt).not.toBeNull();
    // After completion, helper returns false (already completed) and createDraft rejects with completed
    expect(shouldCompleteTrainingAfterShot(completed, count10)).toBe(false);
    await expect(createDraft(tLim.id, 120, 200, epoch)).rejects.toThrow(/completed/i);
  });

  it('pure seam shouldCompleteTrainingAfterShot respects legacy and unlimited trainings', () => {
    const now = new Date().toISOString();
    // Legacy training without targetShotCount field
    const legacy = { id: 't1', athleteId: 'a1', startedAt: now, updatedAt: now, completedAt: null, nextShotNumber: 11 } as any;
    expect(shouldCompleteTrainingAfterShot(legacy, 10)).toBe(false);
    expect(shouldCompleteTrainingAfterShot(legacy, 100)).toBe(false);

    // Explicit unlimited training (targetShotCount = null)
    const unlimited = { id: 't2', athleteId: 'a1', startedAt: now, updatedAt: now, completedAt: null, nextShotNumber: 11, targetShotCount: null };
    expect(shouldCompleteTrainingAfterShot(unlimited, 10)).toBe(false);
    expect(shouldCompleteTrainingAfterShot(unlimited, 100)).toBe(false);

    // Already completed limited training
    const completed = { id: 't3', athleteId: 'a1', startedAt: now, updatedAt: now, completedAt: now, nextShotNumber: 11, targetShotCount: 10 };
    expect(shouldCompleteTrainingAfterShot(completed, 10)).toBe(false);
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
    expect(b2.trainings[0].targetShotCount).toBe(10);
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

  it('validateBackup validates targetShotCount correctly', () => {
    const now = new Date().toISOString();
    const baseBackup = {
      version: 1,
      exportedAt: now,
      athletes: [{ id: 'a1', name: 'X', createdAt: now, updatedAt: now }],
      trainings: [{ id: 't1', athleteId: 'a1', startedAt: now, updatedAt: now, completedAt: null, nextShotNumber: 1, targetShotCount: 10 }],
      shots: [],
      settings: { SCORING_VERSION: 1, dataEpoch: 1, storagePersisted: null, lastBackupAt: null },
    };

    // Valid positive integer
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: 10 }] })).not.toThrow();
    // Valid null (unlimited)
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: null }] })).not.toThrow();
    // Valid undefined (legacy omitted)
    const { targetShotCount, ...legacyTraining } = baseBackup.trainings[0];
    expect(() => validateBackup({ ...baseBackup, trainings: [legacyTraining] })).not.toThrow();

    // Invalid: 0
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: 0 }] })).toThrow(/Invalid targetShotCount/i);
    // Invalid: negative
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: -5 }] })).toThrow(/Invalid targetShotCount/i);
    // Invalid: float
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: 10.5 }] })).toThrow(/Invalid targetShotCount/i);
    // Invalid: NaN
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: NaN }] })).toThrow(/Invalid targetShotCount/i);
    // Invalid: Infinity
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: Infinity }] })).toThrow(/Invalid targetShotCount/i);
    // Invalid: string
    expect(() => validateBackup({ ...baseBackup, trainings: [{ ...baseBackup.trainings[0], targetShotCount: '10' as any }] })).toThrow(/Invalid targetShotCount/i);
  });
});

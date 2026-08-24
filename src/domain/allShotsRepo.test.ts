import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from '../db/open';
import { initSettings, getSetting } from '../db/settings';
import { createAthlete, createTraining, createDraft, commitShot, destroyBC } from './index';
import { createComment } from './commentRepo';
import { listAllShotsForAthlete } from './allShotsRepo';
import { DB_NAME } from '../db/schema';

async function setup() {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
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

describe('allShotsRepo', () => {
  let epoch: number;

  beforeEach(async () => {
    epoch = await setup();
  });

  afterEach(async () => {
    await teardown();
  });

  it('returns [] for an athlete with no trainings', async () => {
    const a = await createAthlete('Empty');
    const result = await listAllShotsForAthlete(a.id);
    expect(result).toEqual([]);
  });

  it('numbers shots 1..N chronologically across trainings, distinct from per-training shotNumber', async () => {
    const a = await createAthlete('Multi');
    const t1 = await createTraining(a.id, epoch);
    const s1a = await createDraft(t1.id, 100, 100, epoch);
    await commitShot(s1a.id, 100, 100, epoch);
    const s1b = await createDraft(t1.id, 100, 100, epoch);
    await commitShot(s1b.id, 100, 100, epoch);

    // Force t2 to start strictly after t1 for deterministic chronological order.
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await createTraining(a.id, epoch);
    const s2a = await createDraft(t2.id, 100, 100, epoch);
    await commitShot(s2a.id, 100, 100, epoch);

    const entries = await listAllShotsForAthlete(a.id);
    expect(entries.map((e) => e.globalNumber)).toEqual([1, 2, 3]);
    expect(entries.map((e) => e.shot.id)).toEqual([s1a.id, s1b.id, s2a.id]);
    // globalNumber for the second training's shot (1 in-training) differs from globalNumber (3)
    expect(entries[2].shot.shotNumber).toBe(1);
    expect(entries[2].globalNumber).toBe(3);
  });

  it('excludes draft shots and does not assign them a number', async () => {
    const a = await createAthlete('WithDraft');
    const t = await createTraining(a.id, epoch);
    const committed = await createDraft(t.id, 100, 100, epoch);
    await commitShot(committed.id, 100, 100, epoch);
    await createDraft(t.id, 200, 200, epoch); // stays draft

    const entries = await listAllShotsForAthlete(a.id);
    expect(entries).toHaveLength(1);
    expect(entries[0].shot.id).toBe(committed.id);
    expect(entries[0].globalNumber).toBe(1);
  });

  it('reports hasComment/commentText based on presence of a comment', async () => {
    const a = await createAthlete('Commented');
    const t = await createTraining(a.id, epoch);
    const s1 = await createDraft(t.id, 100, 100, epoch);
    await commitShot(s1.id, 100, 100, epoch);
    const s2 = await createDraft(t.id, 100, 100, epoch);
    await commitShot(s2.id, 100, 100, epoch);
    await createComment({ athleteId: a.id, trainingId: t.id, shotId: s1.id, text: 'Дёрнул' }, epoch);

    const entries = await listAllShotsForAthlete(a.id);
    const e1 = entries.find((e) => e.shot.id === s1.id)!;
    const e2 = entries.find((e) => e.shot.id === s2.id)!;
    expect(e1.hasComment).toBe(true);
    expect(e1.commentText).toBe('Дёрнул');
    expect(e2.hasComment).toBe(false);
    expect(e2.commentText).toBeNull();
  });

  it('keeps original x/y coordinates unchanged', async () => {
    const a = await createAthlete('Coords');
    const t = await createTraining(a.id, epoch);
    const s = await createDraft(t.id, 1234, 5678, epoch);
    const committed = await commitShot(s.id, 1234, 5678, epoch);

    const entries = await listAllShotsForAthlete(a.id);
    expect(entries[0].shot.x).toBe(committed.x);
    expect(entries[0].shot.y).toBe(committed.y);
  });
});

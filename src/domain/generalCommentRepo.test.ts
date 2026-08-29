import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from '../db/open';
import { initSettings, getSetting } from '../db/settings';
import { DB_NAME } from '../db/schema';
import { createTraining, deleteTraining } from './trainingRepo';
import { createAthlete } from './athleteRepo';
import {
  getGeneralComment,
  listGeneralCommentsByAthlete,
  saveGeneralComment,
  deleteGeneralComment,
} from './generalCommentRepo';

async function setup() {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
  const db = await openDB();
  await initSettings(db);
  const epoch = (await getSetting(db, 'dataEpoch')) as number ?? 1;
  return epoch;
}

function teardown() {
  closeDB();
}

describe('generalCommentRepo', () => {
  let epoch: number;

  beforeEach(async () => { epoch = await setup(); });
  afterEach(teardown);

  it('saveGeneralComment creates a record for a training', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch);
    const saved = await saveGeneralComment(
      { athleteId: athlete.id, trainingId: training.id, text: 'Good series' },
      epoch,
    );
    expect(saved).not.toBeNull();
    expect(saved!.trainingId).toBe(training.id);
    expect(saved!.text).toBe('Good series');

    const fetched = await getGeneralComment(training.id);
    expect(fetched?.text).toBe('Good series');
  });

  it('saveGeneralComment updates the existing record instead of creating a duplicate', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch);
    const first = await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: 'first' }, epoch);
    const second = await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: 'second' }, epoch);
    expect(second!.text).toBe('second');
    expect(second!.createdAt).toBe(first!.createdAt);

    const list = await listGeneralCommentsByAthlete(athlete.id);
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('second');
  });

  it('saveGeneralComment with empty text deletes an existing record and returns null', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch);
    await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: 'to clear' }, epoch);
    const result = await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: '   ' }, epoch);
    expect(result).toBeNull();
    expect(await getGeneralComment(training.id)).toBeUndefined();
  });

  it('saveGeneralComment with empty text and no existing record creates nothing', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch);
    const result = await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: '' }, epoch);
    expect(result).toBeNull();
    expect(await getGeneralComment(training.id)).toBeUndefined();
  });

  it('deleteGeneralComment removes the record', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch);
    await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: 'bye' }, epoch);
    await deleteGeneralComment(training.id, epoch);
    expect(await getGeneralComment(training.id)).toBeUndefined();
  });

  it('deleteTraining cascade-deletes its general comment', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch);
    await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: 'gone with training' }, epoch);
    await deleteTraining(training.id, epoch);
    expect(await getGeneralComment(training.id)).toBeUndefined();
  });

  it('listGeneralCommentsByAthlete returns only that athlete\'s comments', async () => {
    const a1 = await createAthlete('A1');
    const a2 = await createAthlete('A2');
    const t1 = await createTraining(a1.id, epoch);
    const t2 = await createTraining(a2.id, epoch);
    await saveGeneralComment({ athleteId: a1.id, trainingId: t1.id, text: 'for a1' }, epoch);
    await saveGeneralComment({ athleteId: a2.id, trainingId: t2.id, text: 'for a2' }, epoch);
    const list = await listGeneralCommentsByAthlete(a1.id);
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('for a1');
  });
});

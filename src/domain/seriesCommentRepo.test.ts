import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from '../db/open';
import { initSettings, getSetting } from '../db/settings';
import { DB_NAME } from '../db/schema';
import { createTraining, deleteTraining } from './trainingRepo';
import { createAthlete } from './athleteRepo';
import { saveGeneralComment, getGeneralComment } from './generalCommentRepo';
import {
  getSeriesComment,
  listSeriesCommentsByTraining,
  listSeriesCommentsByAthlete,
  saveSeriesComment,
  deleteSeriesComment,
} from './seriesCommentRepo';

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

describe('seriesCommentRepo', () => {
  let epoch: number;

  beforeEach(async () => { epoch = await setup(); });
  afterEach(teardown);

  it('saveSeriesComment creates a record for a (trainingId, seriesNumber) pair', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    const saved = await saveSeriesComment(
      { athleteId: athlete.id, trainingId: training.id, seriesNumber: 3, text: 'Series 3 note' },
      epoch,
    );
    expect(saved).not.toBeNull();
    expect(saved!.trainingId).toBe(training.id);
    expect(saved!.seriesNumber).toBe(3);
    expect(saved!.text).toBe('Series 3 note');

    const fetched = await getSeriesComment(training.id, 3);
    expect(fetched?.text).toBe('Series 3 note');
  });

  it('is independent per seriesNumber within the same training — one series does not affect another', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: 'note 1' }, epoch);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 2, text: 'note 2' }, epoch);

    expect((await getSeriesComment(training.id, 1))?.text).toBe('note 1');
    expect((await getSeriesComment(training.id, 2))?.text).toBe('note 2');

    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: 'note 1 updated' }, epoch);
    expect((await getSeriesComment(training.id, 1))?.text).toBe('note 1 updated');
    expect((await getSeriesComment(training.id, 2))?.text).toBe('note 2');

    const list = await listSeriesCommentsByTraining(training.id);
    expect(list).toHaveLength(2);
  });

  it('is independent from the exercise-wide general comment — editing one does not affect the other', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: 'exercise-wide note' }, epoch);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 3, text: 'series-3 note' }, epoch);

    expect((await getGeneralComment(training.id))?.text).toBe('exercise-wide note');
    expect((await getSeriesComment(training.id, 3))?.text).toBe('series-3 note');

    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 3, text: 'series-3 note updated' }, epoch);
    expect((await getGeneralComment(training.id))?.text).toBe('exercise-wide note');

    await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text: 'exercise-wide note updated' }, epoch);
    expect((await getSeriesComment(training.id, 3))?.text).toBe('series-3 note updated');
  });

  it('saveSeriesComment updates the existing record instead of creating a duplicate', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    const first = await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: 'first' }, epoch);
    const second = await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: 'second' }, epoch);
    expect(second!.text).toBe('second');
    expect(second!.createdAt).toBe(first!.createdAt);

    const list = await listSeriesCommentsByTraining(training.id);
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('second');
  });

  it('saveSeriesComment with empty text deletes an existing record and returns null', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: 'to clear' }, epoch);
    const result = await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: '   ' }, epoch);
    expect(result).toBeNull();
    expect(await getSeriesComment(training.id, 1)).toBeUndefined();
  });

  it('saveSeriesComment with empty text and no existing record creates nothing', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    const result = await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: '' }, epoch);
    expect(result).toBeNull();
    expect(await getSeriesComment(training.id, 1)).toBeUndefined();
  });

  it('deleteSeriesComment removes the record', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: 'bye' }, epoch);
    await deleteSeriesComment(training.id, 1, epoch);
    expect(await getSeriesComment(training.id, 1)).toBeUndefined();
  });

  it('deleteTraining cascade-deletes all its series comments', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 1, text: 'gone with training' }, epoch);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 2, text: 'also gone' }, epoch);
    await deleteTraining(training.id, epoch);
    expect(await getSeriesComment(training.id, 1)).toBeUndefined();
    expect(await getSeriesComment(training.id, 2)).toBeUndefined();
    expect(await listSeriesCommentsByTraining(training.id)).toHaveLength(0);
  });

  it('deleting one training\'s series comments does not affect another training\'s', async () => {
    const athlete = await createAthlete('Coach');
    const t1 = await createTraining(athlete.id, epoch, 60);
    const t2 = await createTraining(athlete.id, epoch, 60);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: t1.id, seriesNumber: 1, text: 't1 note' }, epoch);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: t2.id, seriesNumber: 1, text: 't2 note' }, epoch);
    await deleteTraining(t1.id, epoch);
    expect(await getSeriesComment(t1.id, 1)).toBeUndefined();
    expect((await getSeriesComment(t2.id, 1))?.text).toBe('t2 note');
  });

  it('listSeriesCommentsByAthlete returns only that athlete\'s series comments', async () => {
    const a1 = await createAthlete('A1');
    const a2 = await createAthlete('A2');
    const t1 = await createTraining(a1.id, epoch, 60);
    const t2 = await createTraining(a2.id, epoch, 60);
    await saveSeriesComment({ athleteId: a1.id, trainingId: t1.id, seriesNumber: 1, text: 'for a1' }, epoch);
    await saveSeriesComment({ athleteId: a2.id, trainingId: t2.id, seriesNumber: 1, text: 'for a2' }, epoch);
    const list = await listSeriesCommentsByAthlete(a1.id);
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('for a1');
  });

  it('listSeriesCommentsByTraining sorts by seriesNumber', async () => {
    const athlete = await createAthlete('Coach');
    const training = await createTraining(athlete.id, epoch, 60);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 5, text: 'five' }, epoch);
    await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: 2, text: 'two' }, epoch);
    const list = await listSeriesCommentsByTraining(training.id);
    expect(list.map(sc => sc.seriesNumber)).toEqual([2, 5]);
  });
});

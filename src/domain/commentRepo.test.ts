import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, closeDB } from '../db/open';
import { initSettings, getSetting } from '../db/settings';
import { DB_NAME } from '../db/schema';
import {
  createComment,
  listCommentsByAthlete,
  listCommentsByShot,
  updateComment,
  deleteComment,
} from './commentRepo';

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

const A_ID = 'athlete-1';
const T_ID = 'training-1';
const S_ID = 'shot-1';

describe('commentRepo', () => {
  let epoch: number;

  beforeEach(async () => { epoch = await setup(); });
  afterEach(teardown);

  it('createComment returns a record with correct fields', async () => {
    const c = await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'Good' }, epoch);
    expect(c.id).toBeDefined();
    expect(c.athleteId).toBe(A_ID);
    expect(c.trainingId).toBe(T_ID);
    expect(c.shotId).toBe(S_ID);
    expect(c.text).toBe('Good');
    expect(c.createdAt).toBeDefined();
  });

  it('listCommentsByAthlete returns only that athlete\'s comments', async () => {
    await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'c1' }, epoch);
    await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'c2' }, epoch);
    await createComment({ athleteId: 'other', trainingId: T_ID, shotId: S_ID, text: 'other' }, epoch);
    const list = await listCommentsByAthlete(A_ID);
    expect(list).toHaveLength(2);
    expect(list.every((c) => c.athleteId === A_ID)).toBe(true);
  });

  it('listCommentsByShot returns only comments for that shot', async () => {
    await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'c1' }, epoch);
    await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: 'other-shot', text: 'c2' }, epoch);
    const list = await listCommentsByShot(S_ID);
    expect(list).toHaveLength(1);
    expect(list[0].shotId).toBe(S_ID);
  });

  it('updateComment changes text and updatedAt', async () => {
    const c = await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'original' }, epoch);
    const updated = await updateComment(c.id, 'revised', epoch);
    expect(updated.text).toBe('revised');
    expect(updated.updatedAt >= c.updatedAt).toBe(true);
  });

  it('deleteComment removes the record', async () => {
    const c = await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'bye' }, epoch);
    await deleteComment(c.id, epoch);
    const list = await listCommentsByAthlete(A_ID);
    expect(list).toHaveLength(0);
  });

  // These tests mirror the save-comment logic in TrainingScreen:
  // open → pre-fill → save (update / delete-on-clear / no-duplicate-create)

  it('save: updates existing comment without creating a duplicate', async () => {
    const c = await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'first' }, epoch);
    // simulate save with non-empty text when comment already exists
    await updateComment(c.id, 'second', epoch);
    const list = await listCommentsByShot(S_ID);
    expect(list).toHaveLength(1);
    expect(list[0].text).toBe('second');
  });

  it('save: deletes existing comment when text is cleared', async () => {
    const c = await createComment({ athleteId: A_ID, trainingId: T_ID, shotId: S_ID, text: 'to clear' }, epoch);
    // simulate save with empty text when comment already exists
    await deleteComment(c.id, epoch);
    const list = await listCommentsByShot(S_ID);
    expect(list).toHaveLength(0);
  });

  it('save: listCommentsByShot returns empty when no comment exists for shot', async () => {
    const list = await listCommentsByShot(S_ID);
    expect(list).toHaveLength(0);
  });
});

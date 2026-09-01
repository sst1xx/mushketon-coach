import { describe, it, expect } from 'vitest';
import { filterAllShotsEntries } from './allShotsFilter';
import type { AllShotsEntry } from '../domain/allShotsRepo';
import type { ShotRecord } from '../db/schema';

function makeEntry(id: string, trainingId: string, globalNumber: number): AllShotsEntry {
  return {
    shot: { id, trainingId, shotNumber: globalNumber } as ShotRecord,
    trainingId,
    globalNumber,
    hasComment: false,
    commentText: null,
  };
}

describe('filterAllShotsEntries', () => {
  it('returns all entries unchanged when trainingId is null', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2), makeEntry('s3', 't1', 3)];
    const result = filterAllShotsEntries(entries, null);
    expect(result).toEqual(entries);
  });

  it('returns only entries of the selected training', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2), makeEntry('s3', 't1', 3)];
    const result = filterAllShotsEntries(entries, 't1');
    expect(result.map((e) => e.shot.id)).toEqual(['s1', 's3']);
  });

  it('renumbers globalNumber densely starting at 1 within the filtered training', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2), makeEntry('s3', 't1', 3), makeEntry('s4', 't1', 4)];
    const result = filterAllShotsEntries(entries, 't1');
    expect(result.map((e) => e.globalNumber)).toEqual([1, 2, 3]);
  });

  it('returns an empty array when the training id does not match any entry', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2)];
    const result = filterAllShotsEntries(entries, 'nonexistent');
    expect(result).toEqual([]);
  });
});

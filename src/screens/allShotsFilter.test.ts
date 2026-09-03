import { describe, it, expect } from 'vitest';
import { filterAllShotsEntries, toggleAllTrainingsFilter } from './allShotsFilter';
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
  it('returns all entries unchanged when trainingIds is null', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2), makeEntry('s3', 't1', 3)];
    const result = filterAllShotsEntries(entries, null);
    expect(result).toEqual(entries);
  });

  it('returns empty array when trainingIds is an empty set', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2), makeEntry('s3', 't1', 3)];
    const result = filterAllShotsEntries(entries, new Set());
    expect(result).toEqual([]);
  });

  it('returns only entries of the selected training', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2), makeEntry('s3', 't1', 3)];
    const result = filterAllShotsEntries(entries, new Set(['t1']));
    expect(result.map((e) => e.shot.id)).toEqual(['s1', 's3']);
  });

  it('returns entries from multiple selected trainings, preserving original order', () => {
    const entries = [
      makeEntry('s1', 't1', 1),
      makeEntry('s2', 't2', 2),
      makeEntry('s3', 't3', 3),
      makeEntry('s4', 't1', 4),
    ];
    const result = filterAllShotsEntries(entries, new Set(['t1', 't3']));
    expect(result.map((e) => e.shot.id)).toEqual(['s1', 's3', 's4']);
  });

  it('renumbers globalNumber densely starting at 1 within the filtered trainings', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2), makeEntry('s3', 't1', 3), makeEntry('s4', 't1', 4)];
    const result = filterAllShotsEntries(entries, new Set(['t1']));
    expect(result.map((e) => e.globalNumber)).toEqual([1, 2, 3]);
  });

  it('returns an empty array when no training id in the set matches any entry', () => {
    const entries = [makeEntry('s1', 't1', 1), makeEntry('s2', 't2', 2)];
    const result = filterAllShotsEntries(entries, new Set(['nonexistent']));
    expect(result).toEqual([]);
  });
});

describe('toggleAllTrainingsFilter', () => {
  it('returns new empty Set when current is null', () => {
    const result = toggleAllTrainingsFilter(null);
    expect(result).toEqual(new Set());
  });

  it('returns null when current is an empty Set', () => {
    const result = toggleAllTrainingsFilter(new Set());
    expect(result).toBeNull();
  });

  it('returns null when current is a non-empty Set', () => {
    const result = toggleAllTrainingsFilter(new Set(['t1', 't2']));
    expect(result).toBeNull();
  });
});

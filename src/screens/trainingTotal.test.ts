import { describe, it, expect } from 'vitest';
import { formatTrainingTotal } from './trainingTotal';
import type { ShotRecord } from '../db/schema';

function makeShot(overrides: Partial<ShotRecord> = {}): ShotRecord {
  return {
    id: 's1',
    trainingId: 't1',
    shotNumber: 1,
    x: 0,
    y: 0,
    score: 90,
    status: 'committed',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('formatTrainingTotal', () => {
  it('returns "–" for an empty shot list', () => {
    expect(formatTrainingTotal([])).toBe('–');
  });

  it('returns "–" when there are only draft shots', () => {
    expect(formatTrainingTotal([makeShot({ status: 'draft' })])).toBe('–');
  });

  it('sums committed shot scores as whole total with decimal in parentheses', () => {
    const shots = [
      makeShot({ id: 's1', score: 109 }),
      makeShot({ id: 's2', score: 95 }),
      makeShot({ id: 's3', score: 100 }),
    ];
    expect(formatTrainingTotal(shots)).toBe('29 (30.4)');
  });

  it('never lets the whole total exceed the sum of per-shot whole points (10x109)', () => {
    const shots = Array.from({ length: 10 }, (_, i) => makeShot({ id: `s${i}`, score: 109 }));
    expect(formatTrainingTotal(shots)).toBe('100 (109.0)');
  });

  it('sums per-shot whole points, not floor of the decimal total (7.1 + 5.1)', () => {
    const shots = [
      makeShot({ id: 's1', score: 71 }),
      makeShot({ id: 's2', score: 51 }),
    ];
    expect(formatTrainingTotal(shots)).toBe('12 (12.2)');
  });

  it('sums per-shot whole points, not floor of the decimal total (9.9 + 9.9)', () => {
    const shots = [
      makeShot({ id: 's1', score: 99 }),
      makeShot({ id: 's2', score: 99 }),
    ];
    expect(formatTrainingTotal(shots)).toBe('18 (19.8)');
  });

  it('handles a single shot of 1.0', () => {
    const shots = [makeShot({ id: 's1', score: 10 })];
    expect(formatTrainingTotal(shots)).toBe('1 (1.0)');
  });

  it('sums per-shot whole points across 60 shots of 9.5', () => {
    const shots = Array.from({ length: 60 }, (_, i) => makeShot({ id: `s${i}`, score: 95 }));
    expect(formatTrainingTotal(shots)).toBe('540 (570.0)');
  });

  it('ignores draft shots mixed in with committed ones', () => {
    const shots = [
      makeShot({ id: 's1', score: 109, status: 'committed' }),
      makeShot({ id: 's2', score: 90, status: 'draft' }),
    ];
    expect(formatTrainingTotal(shots)).toBe('10 (10.9)');
  });

  it('counts a committed miss (score 0) toward the total', () => {
    const shots = [
      makeShot({ id: 's1', score: 100, status: 'committed' }),
      makeShot({ id: 's2', score: 0, status: 'committed' }),
    ];
    expect(formatTrainingTotal(shots)).toBe('10 (10.0)');
  });
});

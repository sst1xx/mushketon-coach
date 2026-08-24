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
    expect(formatTrainingTotal(shots)).toBe('30 (30.4)');
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

import { describe, it, expect } from 'vitest';
import {
  getTrainingMode,
  getPp3SeriesBlocks,
  getPp3CurrentSeriesNumber,
  getPp3CurrentSeriesProgress,
  getPp3SeriesShotNumberRange,
  getPp3ViewedShots,
  getPp3CanvasShots,
  getTrainingListLabel,
  resolvePp3ViewedSeriesNumber,
  isViewingPastPp3Series,
} from './trainingMode';
import type { ShotRecord } from '../db/schema';

function committedShot(shotNumber: number): ShotRecord {
  return {
    id: `s${shotNumber}`,
    trainingId: 't1',
    shotNumber,
    x: 0,
    y: 0,
    score: 100,
    status: 'committed',
    createdAt: '',
    updatedAt: '',
  };
}

function draftShot(shotNumber: number): ShotRecord {
  return { ...committedShot(shotNumber), status: 'draft' };
}

describe('getTrainingMode', () => {
  it('recognizes a series (targetShotCount 10)', () => {
    expect(getTrainingMode({ targetShotCount: 10 })).toBe('series');
  });

  it('recognizes ПП-3 (targetShotCount 60)', () => {
    expect(getTrainingMode({ targetShotCount: 60 })).toBe('pp3');
  });

  it('treats null/undefined/other counts as legacy', () => {
    expect(getTrainingMode({ targetShotCount: null })).toBe('legacy');
    expect(getTrainingMode({ targetShotCount: undefined })).toBe('legacy');
    expect(getTrainingMode({ targetShotCount: 30 })).toBe('legacy');
  });
});

describe('getPp3SeriesBlocks', () => {
  it('splits 17 committed shots into 6 blocks with the 2nd marked current', () => {
    const shots = Array.from({ length: 17 }, (_, i) => committedShot(i + 1));
    const blocks = getPp3SeriesBlocks(shots, 2);
    expect(blocks).toHaveLength(6);
    expect(blocks[0].committedCount).toBe(10);
    expect(blocks[0].isCurrent).toBe(false);
    expect(blocks[1].committedCount).toBe(7);
    expect(blocks[1].isCurrent).toBe(true);
    expect(blocks[2].committedCount).toBe(0);
    expect(blocks[2].isCurrent).toBe(false);
  });

  it('marks no block current once all 60 shots are committed', () => {
    const shots = Array.from({ length: 60 }, (_, i) => committedShot(i + 1));
    const blocks = getPp3SeriesBlocks(shots, 6);
    expect(blocks.every((b) => b.committedCount === 10)).toBe(true);
    expect(blocks.every((b) => !b.isCurrent)).toBe(true);
  });

  it('marks the first block current when no shots exist yet', () => {
    const blocks = getPp3SeriesBlocks([], 1);
    expect(blocks[0].isCurrent).toBe(true);
    expect(blocks[0].committedCount).toBe(0);
  });

  it('does not mark a fully-committed block current even if it matches currentSeriesNumber (transient gap before the next draft)', () => {
    // 10 committed, no draft yet: block 1 is full and no block is flagged
    // current until an 11th shot (draft or committed) actually appears.
    const shots = Array.from({ length: 10 }, (_, i) => committedShot(i + 1));
    const blocks = getPp3SeriesBlocks(shots, 1);
    expect(blocks[0].committedCount).toBe(10);
    expect(blocks.every((b) => !b.isCurrent)).toBe(true);
  });
});

describe('getPp3CurrentSeriesNumber', () => {
  it('stays on series 1 through the 10th shot, no shots yet resolves to series 1', () => {
    expect(getPp3CurrentSeriesNumber(0)).toBe(1);
    expect(getPp3CurrentSeriesNumber(9)).toBe(1);
    expect(getPp3CurrentSeriesNumber(10)).toBe(1);
  });

  it('switches to series 2 only once shot 11 (draft or committed) appears', () => {
    expect(getPp3CurrentSeriesNumber(11)).toBe(2);
    expect(getPp3CurrentSeriesNumber(17)).toBe(2);
    expect(getPp3CurrentSeriesNumber(20)).toBe(2);
  });

  it('switches to series 3 only once shot 21 appears', () => {
    expect(getPp3CurrentSeriesNumber(21)).toBe(3);
  });

  it('clamps to series 6 for the final block, including its 60th shot', () => {
    expect(getPp3CurrentSeriesNumber(51)).toBe(6);
    expect(getPp3CurrentSeriesNumber(59)).toBe(6);
    expect(getPp3CurrentSeriesNumber(60)).toBe(6);
  });
});

describe('getPp3ViewedShots (target canvas boundary behavior)', () => {
  it('keeps all 10 shots of series 1 visible right after the 10th is committed', () => {
    const shots = Array.from({ length: 10 }, (_, i) => committedShot(i + 1));
    const currentSeries = getPp3CurrentSeriesNumber(10);
    expect(currentSeries).toBe(1);
    expect(getPp3ViewedShots(shots, currentSeries)).toHaveLength(10);
  });

  it('switches to series 2 and drops series 1 shots once the 11th shot (draft) is placed', () => {
    const shots = [...Array.from({ length: 10 }, (_, i) => committedShot(i + 1)), draftShot(11)];
    const maxShotNumber = Math.max(...shots.map((s) => s.shotNumber));
    const currentSeries = getPp3CurrentSeriesNumber(maxShotNumber);
    expect(currentSeries).toBe(2);
    const viewed = getPp3ViewedShots(shots, currentSeries);
    expect(viewed.map((s) => s.shotNumber)).toEqual([11]);
  });

  it('keeps series 2 fully visible through its 20th shot, then switches to series 3 at shot 21', () => {
    const twenty = Array.from({ length: 20 }, (_, i) => committedShot(i + 1));
    const atTwenty = getPp3CurrentSeriesNumber(20);
    expect(atTwenty).toBe(2);
    expect(getPp3ViewedShots(twenty, atTwenty)).toHaveLength(10);

    const twentyOne = [...twenty, committedShot(21)];
    const atTwentyOne = getPp3CurrentSeriesNumber(21);
    expect(atTwentyOne).toBe(3);
    const viewed = getPp3ViewedShots(twentyOne, atTwentyOne);
    expect(viewed.map((s) => s.shotNumber)).toEqual([21]);
  });

  it('keeps the final block (series 6) visible with all 10 shots after the 60th shot completes the exercise', () => {
    const shots = Array.from({ length: 60 }, (_, i) => committedShot(i + 1));
    const currentSeries = getPp3CurrentSeriesNumber(60);
    expect(currentSeries).toBe(6);
    const viewed = getPp3ViewedShots(shots, currentSeries);
    expect(viewed).toHaveLength(10);
    expect(viewed.map((s) => s.shotNumber)).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
  });
});

describe('getPp3CanvasShots («Просмотр» after finishing a series vs. the whole exercise)', () => {
  it('shows only the finished series (10 shots) when the exercise is not yet complete', () => {
    const shots = Array.from({ length: 10 }, (_, i) => committedShot(i + 1));
    const result = getPp3CanvasShots(shots, 1, false, null);
    expect(result.map((s) => s.shotNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('shows all 60 shots when the whole ПП-3 exercise is complete and no series is explicitly selected', () => {
    const shots = Array.from({ length: 60 }, (_, i) => committedShot(i + 1));
    const currentSeries = getPp3CurrentSeriesNumber(60);
    const result = getPp3CanvasShots(shots, currentSeries, true, null);
    expect(result).toHaveLength(60);
  });

  it('still narrows to one series when the coach explicitly selects it after completion', () => {
    const shots = Array.from({ length: 60 }, (_, i) => committedShot(i + 1));
    const result = getPp3CanvasShots(shots, 3, true, 3);
    expect(result.map((s) => s.shotNumber)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
  });
});

describe('resolvePp3ViewedSeriesNumber', () => {
  it('falls back to the current series when no explicit selection was made', () => {
    expect(resolvePp3ViewedSeriesNumber(null, 3)).toBe(3);
  });

  it('uses the explicitly selected series over the current one', () => {
    expect(resolvePp3ViewedSeriesNumber(1, 3)).toBe(1);
  });
});

describe('isViewingPastPp3Series', () => {
  it('is false when no series is explicitly selected', () => {
    expect(isViewingPastPp3Series(null, 3)).toBe(false);
  });

  it('is false when the selected series is the current one', () => {
    expect(isViewingPastPp3Series(3, 3)).toBe(false);
  });

  it('is true when a completed series other than the current one is selected', () => {
    expect(isViewingPastPp3Series(1, 3)).toBe(true);
  });
});

describe('getPp3CurrentSeriesProgress', () => {
  it('computes progress within the current series', () => {
    expect(getPp3CurrentSeriesProgress(0)).toBe(0);
    expect(getPp3CurrentSeriesProgress(17)).toBe(7);
    expect(getPp3CurrentSeriesProgress(60)).toBe(10);
  });
});

describe('getPp3SeriesShotNumberRange', () => {
  it('returns the shotNumber window for each series so the target switches after every ten', () => {
    expect(getPp3SeriesShotNumberRange(1)).toEqual({ start: 1, end: 10 });
    expect(getPp3SeriesShotNumberRange(2)).toEqual({ start: 11, end: 20 });
    expect(getPp3SeriesShotNumberRange(6)).toEqual({ start: 51, end: 60 });
  });
});

describe('getTrainingListLabel', () => {
  it('labels a series', () => {
    expect(getTrainingListLabel({ targetShotCount: 10 }, 4)).toBe('Серия · 4/10');
  });

  it('labels a ПП-3 exercise', () => {
    expect(getTrainingListLabel({ targetShotCount: 60 }, 17)).toBe('ПП-3 · 1/6 серий · 17/60 выстрелов');
  });

  it('returns null for legacy records', () => {
    expect(getTrainingListLabel({ targetShotCount: null }, 4)).toBeNull();
    expect(getTrainingListLabel({ targetShotCount: undefined }, 4)).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import {
  seriesFoldKey,
  defaultTrainingFolded,
  defaultSeriesFolded,
  isTrainingFolded,
  isSeriesFolded,
  collapseAllFoldState,
  expandAllFoldState,
} from './diaryFold';

describe('seriesFoldKey', () => {
  it('joins trainingId and seriesIndex', () => {
    expect(seriesFoldKey('t1', 2)).toBe('t1:2');
  });
});

describe('defaultTrainingFolded', () => {
  it('is expanded when training is not completed', () => {
    expect(defaultTrainingFolded({ completedAt: null, hasGeneralComment: false, hasAnySeriesOrShotComment: false })).toBe(false);
  });
  it('is expanded when there is a general comment', () => {
    expect(defaultTrainingFolded({ completedAt: '2024-01-01', hasGeneralComment: true, hasAnySeriesOrShotComment: false })).toBe(false);
  });
  it('is expanded when there is any series/shot comment', () => {
    expect(defaultTrainingFolded({ completedAt: '2024-01-01', hasGeneralComment: false, hasAnySeriesOrShotComment: true })).toBe(false);
  });
  it('is folded when completed and no comments at all', () => {
    expect(defaultTrainingFolded({ completedAt: '2024-01-01', hasGeneralComment: false, hasAnySeriesOrShotComment: false })).toBe(true);
  });
});

describe('defaultSeriesFolded', () => {
  it('is expanded when there is a series comment', () => {
    expect(defaultSeriesFolded({ hasSeriesComment: true, hasShotComments: false })).toBe(false);
  });
  it('is expanded when there are shot comments', () => {
    expect(defaultSeriesFolded({ hasSeriesComment: false, hasShotComments: true })).toBe(false);
  });
  it('is folded when empty', () => {
    expect(defaultSeriesFolded({ hasSeriesComment: false, hasShotComments: false })).toBe(true);
  });
});

describe('isTrainingFolded', () => {
  it('uses default when no explicit value', () => {
    expect(isTrainingFolded(undefined, 't1', true)).toBe(true);
    expect(isTrainingFolded({}, 't1', false)).toBe(false);
  });
  it('explicit value overrides default', () => {
    expect(isTrainingFolded({ t1: false }, 't1', true)).toBe(false);
    expect(isTrainingFolded({ t1: true }, 't1', false)).toBe(true);
  });
});

describe('isSeriesFolded', () => {
  it('uses default when no explicit value', () => {
    expect(isSeriesFolded(undefined, 't1', 2, true)).toBe(true);
  });
  it('explicit value overrides default, keyed by trainingId+index', () => {
    expect(isSeriesFolded({ 't1:2': false }, 't1', 2, true)).toBe(false);
    // different training with same series index is not affected
    expect(isSeriesFolded({ 't1:2': false }, 't2', 2, true)).toBe(true);
  });
});

describe('collapseAllFoldState', () => {
  it('sets true for every visible training and series', () => {
    const result = collapseAllFoldState([
      { trainingId: 't1', seriesIndexes: [1, 2] },
      { trainingId: 't2', seriesIndexes: [] },
    ]);
    expect(result.foldedTrainings).toEqual({ t1: true, t2: true });
    expect(result.foldedSeries).toEqual({ 't1:1': true, 't1:2': true });
  });
});

describe('expandAllFoldState', () => {
  it('sets false for every visible training and series', () => {
    const result = expandAllFoldState([
      { trainingId: 't1', seriesIndexes: [1] },
    ]);
    expect(result.foldedTrainings).toEqual({ t1: false });
    expect(result.foldedSeries).toEqual({ 't1:1': false });
  });

  it('produces empty dicts for an empty entries list', () => {
    expect(expandAllFoldState([])).toEqual({ foldedTrainings: {}, foldedSeries: {} });
  });
});

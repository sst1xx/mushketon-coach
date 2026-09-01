import { describe, it, expect } from 'vitest';
import { formatCommentLine, formatShotLabel } from './allShotsCaption';
import type { AllShotsEntry } from '../domain/allShotsRepo';
import type { ShotRecord } from '../db/schema';

function makeEntry(overrides: Partial<AllShotsEntry> = {}): AllShotsEntry {
  const shot: ShotRecord = {
    id: 's1',
    trainingId: 't1',
    shotNumber: 1,
    x: 0,
    y: 0,
    score: 90,
    status: 'committed',
    createdAt: '',
    updatedAt: '',
  };
  return {
    shot,
    trainingId: 't1',
    globalNumber: 1,
    hasComment: false,
    commentText: null,
    ...overrides,
  };
}

describe('formatCommentLine', () => {
  it('returns empty string for null entry', () => {
    expect(formatCommentLine(null)).toBe('');
  });

  it('returns empty string when the entry has no comment', () => {
    expect(formatCommentLine(makeEntry({ hasComment: false, commentText: null }))).toBe('');
  });

  it('prefixes ordinary comment text with the speech-bubble icon', () => {
    expect(
      formatCommentLine(makeEntry({ hasComment: true, commentText: 'Дёрнул спуск' })),
    ).toBe('💬 Дёрнул спуск');
  });

  it('renders a placeholder dash for whitespace-only comment text', () => {
    expect(formatCommentLine(makeEntry({ hasComment: true, commentText: '   ' }))).toBe('💬 —');
  });

  it('preserves long comment text unmodified (wrapping/truncation is a CSS concern)', () => {
    const long = 'Это очень длинный комментарий, который должен быть перенесён в несколько строк в интерфейсе.';
    expect(formatCommentLine(makeEntry({ hasComment: true, commentText: long }))).toBe(`💬 ${long}`);
  });
});

describe('formatShotLabel', () => {
  it('returns a dash placeholder for a null entry', () => {
    expect(formatShotLabel(null, false)).toBe('–');
  });

  it('renders №N • score without a date when only one training is displayed', () => {
    const entry = makeEntry({ globalNumber: 3, shot: { id: 's1', trainingId: 't1', shotNumber: 3, x: 0, y: 0, score: 98, status: 'committed', createdAt: '2024-07-21T10:00:00.000Z', updatedAt: '' } });
    expect(formatShotLabel(entry, false)).toBe('№3 • 9.8');
  });

  it('renders the shot\'s training date in parentheses when multiple trainings are displayed', () => {
    const entry = makeEntry({ globalNumber: 3, shot: { id: 's1', trainingId: 't1', shotNumber: 3, x: 0, y: 0, score: 98, status: 'committed', createdAt: '2024-07-21T10:00:00.000Z', updatedAt: '' } });
    expect(formatShotLabel(entry, true)).toBe('№3 (21 июл.) • 9.8');
  });

  it('renders 0.0 for a miss (score 0)', () => {
    const entry = makeEntry({ globalNumber: 1, shot: { id: 's1', trainingId: 't1', shotNumber: 1, x: 0, y: 0, score: 0, status: 'committed', createdAt: '2024-07-21T10:00:00.000Z', updatedAt: '' } });
    expect(formatShotLabel(entry, false)).toBe('№1 • 0.0');
  });
});

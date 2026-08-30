import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import GeneralRemarkScreen from './GeneralRemarkScreen';
import { renderFunctionComponentToElement } from '../testUtils/fakeHooks';
import type { AthleteRecord, TrainingRecord } from '../db/schema';

// Same technique as trainingScreenCompletionModal.test.tsx: GeneralRemarkScreen
// loads the existing comment text via IndexedDB in an effect, which never
// runs under this DOM-less test setup — force `loading`/`text`/`summary`
// (useState indices 0, 1, 2) directly instead.

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

function training(targetShotCount: number): TrainingRecord {
  return {
    id: 't1', athleteId: athlete.id, startedAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z', completedAt: '2024-01-01T10:05:00.000Z',
    nextShotNumber: targetShotCount + 1, targetShotCount,
  };
}

function renderScreen(t: TrainingRecord, existingText: string, seriesNumber: number | null = null) {
  const props = { athlete, training: t, seriesNumber, onBack: () => {} };
  const element = renderFunctionComponentToElement(
    GeneralRemarkScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 0: false, 1: existingText, 2: { count: 10, total: '96.4 · 96' } },
  );
  return renderToStaticMarkup(element!);
}

describe('GeneralRemarkScreen', () => {
  it('titles the screen "Общее замечание серии" for a standalone series', () => {
    expect(renderScreen(training(10), '')).toContain('Общее замечание серии');
  });

  it('titles the screen "Общее замечание упражнения" for a ПП-3 exercise viewed as a whole (no series picked)', () => {
    expect(renderScreen(training(60), '')).toContain('Общее замечание упражнения');
  });

  it('titles the screen "Общее замечание серии N" for one ПП-3 series, independent from the exercise-wide comment', () => {
    expect(renderScreen(training(60), '', 3)).toContain('Общее замечание серии 3');
  });

  it('pre-fills the textarea with a previously saved general comment (edit-later from the diary)', () => {
    const markup = renderScreen(training(10), 'Сегодня нужно было спокойнее работать на спуске.');
    expect(markup).toContain('Сегодня нужно было спокойнее работать на спуске.');
  });

  it('shows the committed shot count and total summary', () => {
    const markup = renderScreen(training(10), '');
    expect(markup).toContain('10 выстрелов');
    expect(markup).toContain('96.4 · 96');
  });

  it('disables Save while the text is empty, so it can never silently delete the comment (see PLAN-DIARY-AFFORDANCE.md §2)', () => {
    const markup = renderScreen(training(10), '');
    const saveMatch = markup.match(/<button[^>]*disabled=""[^>]*>Сохранить<\/button>/);
    expect(saveMatch).not.toBeNull();
  });

  it('does not disable Save once there is non-empty text', () => {
    const markup = renderScreen(training(10), 'Текст замечания');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Сохранить<\/button>/);
  });
});

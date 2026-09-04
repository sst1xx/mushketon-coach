import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TrainingScreen from './TrainingScreen';
import { renderFunctionComponentToElement } from '../testUtils/fakeHooks';
import type { AthleteRecord, TrainingRecord } from '../db/schema';

// TrainingScreen only renders its content once `loading` (useState index 4)
// is false — see trainingScreenCompletionModal.test.tsx for why this needs
// the fake-hooks dispatcher instead of a real mount.

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

function training(targetShotCount: number, completed = false): TrainingRecord {
  return {
    id: 't1',
    athleteId: athlete.id,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: completed ? new Date().toISOString() : null,
    nextShotNumber: completed ? targetShotCount + 1 : 1,
    targetShotCount,
  };
}

function renderHeader(
  t: TrainingRecord,
  onOpenTrainingRemarks: (training: TrainingRecord, seriesNumber: number | null) => void,
  stateOverrides: Record<number, unknown> = {},
) {
  const props = {
    athlete,
    training: t,
    epoch: 1,
    onBack: () => {},
    onOpenTrainingRemarks,
  };
  const element = renderFunctionComponentToElement(
    TrainingScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 4: false, ...stateOverrides },
  );
  return renderToStaticMarkup(element as React.ReactElement);
}

describe('TrainingScreen header remarks button', () => {
  it('labels the button «Дневник · Серия» for a standalone series', () => {
    const markup = renderHeader(training(10), () => {});
    expect(markup).toContain('Дневник · Серия');
  });

  it('labels the button with the currently active ПП-3 series while the exercise is in progress', () => {
    // No shots yet ⇒ current series is 1, and no series chip has been picked.
    const markup = renderHeader(training(60), () => {});
    expect(markup).toContain('Дневник · Серия 1');
  });

  it('labels the button «Дневник · Упражнение» once the exercise is completed and no series chip is picked', () => {
    const markup = renderHeader(training(60, true), () => {});
    expect(markup).toContain('Дневник · Упражнение');
  });

  it('labels the button with the selected ПП-3 series number', () => {
    // selectedSeriesView is useState index 13; pick series 2 explicitly.
    const markup = renderHeader(training(60), () => {}, { 13: 2 });
    expect(markup).toContain('Дневник · Серия 2');
  });

  it('is present even when the series/exercise has no shots yet (no remarks recorded)', () => {
    const markup = renderHeader(training(10), () => {});
    expect(markup).toContain('Дневник · Серия');
  });

  it('labels the button «Дневник · Пристрелка» for pristrelka', () => {
    const markup = renderHeader(training(99), () => {});
    expect(markup).toContain('Дневник · Пристрелка');
  });

  it('does not render when onOpenTrainingRemarks is not provided', () => {
    const props = { athlete, training: training(10), epoch: 1, onBack: () => {} };
    const element = renderFunctionComponentToElement(
      TrainingScreen as unknown as (p: typeof props) => React.ReactElement,
      props,
      { 4: false },
    );
    const markup = renderToStaticMarkup(element as React.ReactElement);
    expect(markup).not.toContain('Дневник · Серия');
    expect(markup).not.toContain('Дневник · Упражнение');
  });
});

import React from 'react';
import { describe, it, expect } from 'vitest';
import App from './App';
import TrainingScreen from './screens/TrainingScreen';
import GeneralRemarkScreen from './screens/GeneralRemarkScreen';
import TrainingRemarksScreen from './screens/TrainingRemarksScreen';
import RemarksScreen from './screens/RemarksScreen';
import { findElementsByType } from './testUtils/fakeHooks';
import type { AthleteRecord, TrainingRecord } from './db/schema';

// App's screen routing now runs off a navigation stack (see
// PLAN-DIARY-IA.md §4): `stack` (useState index 2) holds `Screen[]`, and
// every transition calls `setStack` with an *updater function* (push/pop/
// replaceTop/reset), never a plain next-value. The fake dispatcher below
// captures each call, applies it against a running `currentStack` (so a
// handler that calls `replaceTop` then `push` — like the completion-modal
// «Общее замечание» button — is exercised faithfully), and exposes every
// resulting stack via `stackCalls` for assertions.
const ReactInternals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } };
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function renderAppScreen(initialStack: unknown[]): { element: React.ReactElement | null; stackCalls: unknown[][] } {
  const stackCalls: unknown[][] = [];
  let currentStack: unknown[] = initialStack;
  let stateIndex = 0;
  const fakeDispatcher = {
    useState: (initial: unknown) => {
      const idx = stateIndex;
      stateIndex += 1;
      if (idx === 0) return [true, () => {}]; // ready
      if (idx === 1) return [null, () => {}]; // error
      if (idx === 2) {
        return [
          currentStack,
          (updaterOrValue: unknown) => {
            const next = typeof updaterOrValue === 'function'
              ? (updaterOrValue as (prev: unknown[]) => unknown[])(currentStack)
              : updaterOrValue as unknown[];
            stackCalls.push(next);
            currentStack = next;
          },
        ]; // stack
      }
      if (idx === 3) return [1, () => {}]; // epoch
      const value = typeof initial === 'function' ? (initial as () => unknown)() : initial;
      return [value, () => {}];
    },
    useEffect: () => {},
  };
  const prevDispatcher = ReactInternals.ReactCurrentDispatcher.current;
  ReactInternals.ReactCurrentDispatcher.current = fakeDispatcher;
  let element: React.ReactElement | null;
  try {
    element = (App as unknown as () => React.ReactElement)();
  } finally {
    ReactInternals.ReactCurrentDispatcher.current = prevDispatcher;
  }
  return { element, stackCalls };
}

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };
const training: TrainingRecord = {
  id: 't1',
  athleteId: athlete.id,
  startedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  nextShotNumber: 11,
  targetShotCount: 10,
};

describe('App routing: Просмотр → правка последнего выстрела → возврат → Общее замечание', () => {
  it('opening «Общее замечание» from the completed training screen replaces the training entry (showCompletionOnMount) then pushes generalRemark', () => {
    const { element, stackCalls } = renderAppScreen([{ name: 'athletes' }, { name: 'training', athlete, training }]);
    const trainingScreens = findElementsByType(element, TrainingScreen);
    expect(trainingScreens).toHaveLength(1);
    const onOpenGeneralRemark = (trainingScreens[0].props as { onOpenGeneralRemark: (t: TrainingRecord) => void }).onOpenGeneralRemark;
    onOpenGeneralRemark(training);
    // replaceTop then push: two setStack calls, final stack has both entries.
    expect(stackCalls).toHaveLength(2);
    expect(stackCalls[0]).toEqual([{ name: 'athletes' }, { name: 'training', athlete, training, showCompletionOnMount: true }]);
    expect(stackCalls[1]).toEqual([
      { name: 'athletes' },
      { name: 'training', athlete, training, showCompletionOnMount: true },
      { name: 'generalRemark', athlete, training, seriesNumber: null },
    ]);
  });

  it('popping from the general remark screen (opened from training) returns to the training screen re-showing the completion overlay', () => {
    const stack = [
      { name: 'athletes' },
      { name: 'training', athlete, training, showCompletionOnMount: true },
      { name: 'generalRemark', athlete, training, seriesNumber: null },
    ];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarkScreens = findElementsByType(element, GeneralRemarkScreen);
    expect(remarkScreens).toHaveLength(1);
    const onBack = (remarkScreens[0].props as { onBack: () => void }).onBack;
    onBack();
    expect(stackCalls).toEqual([[
      { name: 'athletes' },
      { name: 'training', athlete, training, showCompletionOnMount: true },
    ]]);
  });

  it('popping from the general remark screen opened from the diary returns to the diary, not to the training screen', () => {
    const stack = [
      { name: 'athletes' },
      { name: 'remarks', athlete },
      { name: 'generalRemark', athlete, training, seriesNumber: null },
    ];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarkScreens = findElementsByType(element, GeneralRemarkScreen);
    const onBack = (remarkScreens[0].props as { onBack: () => void }).onBack;
    onBack();
    expect(stackCalls).toEqual([[{ name: 'athletes' }, { name: 'remarks', athlete }]]);
  });

  it('«Просмотр» never touches App-level routing (dismissing the completion overlay stays inside TrainingScreen)', () => {
    const { stackCalls } = renderAppScreen([{ name: 'athletes' }, { name: 'training', athlete, training }]);
    expect(stackCalls).toEqual([]);
  });
});

describe('App routing: scoped diary from TrainingScreen (see PLAN-DIARY-IA.md §8)', () => {
  it('opening the header diary button replaces the training entry (restoreSeriesView) then pushes trainingRemarks with the given series number', () => {
    const { element, stackCalls } = renderAppScreen([{ name: 'athletes' }, { name: 'training', athlete, training }]);
    const trainingScreens = findElementsByType(element, TrainingScreen);
    const onOpenTrainingRemarks = (trainingScreens[0].props as {
      onOpenTrainingRemarks: (t: TrainingRecord, seriesNumber: number | null) => void;
    }).onOpenTrainingRemarks;
    onOpenTrainingRemarks(training, null);
    expect(stackCalls).toHaveLength(2);
    expect(stackCalls[1]).toEqual([
      { name: 'athletes' },
      { name: 'training', athlete, training, restoreSeriesView: null },
      { name: 'trainingRemarks', athlete, training, seriesNumber: null },
    ]);
  });

  it('popping from trainingRemarks restores the training screen entry beneath it, with the same series selected', () => {
    const stack = [
      { name: 'athletes' },
      { name: 'training', athlete, training, restoreSeriesView: 3 },
      { name: 'trainingRemarks', athlete, training, seriesNumber: 3 },
    ];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, TrainingRemarksScreen);
    expect(remarksScreens).toHaveLength(1);
    const onBack = (remarksScreens[0].props as { onBack: () => void }).onBack;
    onBack();
    expect(stackCalls).toEqual([[
      { name: 'athletes' },
      { name: 'training', athlete, training, restoreSeriesView: 3 },
    ]]);
  });

  it('opening the target from trainingRemarks pushes a fresh training screen scoped to the same series; popping it returns to trainingRemarks', () => {
    const stack = [{ name: 'athletes' }, { name: 'trainingRemarks', athlete, training, seriesNumber: 2 }];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, TrainingRemarksScreen);
    const onOpenTarget = (remarksScreens[0].props as { onOpenTarget: (t: TrainingRecord, seriesNumber: number | null) => void }).onOpenTarget;
    onOpenTarget(training, 2);
    expect(stackCalls).toEqual([[
      { name: 'athletes' },
      { name: 'trainingRemarks', athlete, training, seriesNumber: 2 },
      { name: 'training', athlete, training, restoreSeriesView: 2 },
    ]]);
  });

  it('opening the general remark editor from trainingRemarks pushes generalRemark with the given target series; popping returns to trainingRemarks, not TrainingScreen', () => {
    const stack = [{ name: 'athletes' }, { name: 'trainingRemarks', athlete, training, seriesNumber: 2 }];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, TrainingRemarksScreen);
    const onOpenGeneralRemark = (remarksScreens[0].props as {
      onOpenGeneralRemark: (t: TrainingRecord, targetSeriesNumber: number | null) => void;
    }).onOpenGeneralRemark;
    onOpenGeneralRemark(training, 2);
    expect(stackCalls).toEqual([[
      { name: 'athletes' },
      { name: 'trainingRemarks', athlete, training, seriesNumber: 2 },
      { name: 'generalRemark', athlete, training, seriesNumber: 2 },
    ]]);

    const stack2 = [
      { name: 'athletes' },
      { name: 'trainingRemarks', athlete, training, seriesNumber: 2 },
      { name: 'generalRemark', athlete, training, seriesNumber: 2 },
    ];
    const { element: element2, stackCalls: stackCalls2 } = renderAppScreen(stack2);
    const remarkScreens = findElementsByType(element2, GeneralRemarkScreen);
    const onBack = (remarkScreens[0].props as { onBack: () => void }).onBack;
    onBack();
    expect(stackCalls2).toEqual([[
      { name: 'athletes' },
      { name: 'trainingRemarks', athlete, training, seriesNumber: 2 },
    ]]);
  });

  it('opening one series from the whole-exercise diary pushes trainingRemarks scoped to that series; popping returns to the exercise-level diary', () => {
    const stack = [{ name: 'athletes' }, { name: 'trainingRemarks', athlete, training, seriesNumber: null }];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, TrainingRemarksScreen);
    const onOpenSeriesDiary = (remarksScreens[0].props as {
      onOpenSeriesDiary?: (t: TrainingRecord, seriesNumber: number) => void;
    }).onOpenSeriesDiary!;
    onOpenSeriesDiary(training, 4);
    expect(stackCalls).toEqual([[
      { name: 'athletes' },
      { name: 'trainingRemarks', athlete, training, seriesNumber: null },
      { name: 'trainingRemarks', athlete, training, seriesNumber: 4 },
    ]]);

    const stack2 = [...stack, { name: 'trainingRemarks', athlete, training, seriesNumber: 4 }];
    const { element: element2, stackCalls: stackCalls2 } = renderAppScreen(stack2);
    const nestedScreens = findElementsByType(element2, TrainingRemarksScreen);
    const onBack = (nestedScreens[0].props as { onBack: () => void }).onBack;
    onBack();
    expect(stackCalls2).toEqual([stack]);
  });

  it('«Открыть все замечания» from trainingRemarks pushes the full diary', () => {
    const stack = [{ name: 'athletes' }, { name: 'trainingRemarks', athlete, training, seriesNumber: null }];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, TrainingRemarksScreen);
    const onOpenAllRemarks = (remarksScreens[0].props as { onOpenAllRemarks: () => void }).onOpenAllRemarks;
    onOpenAllRemarks();
    expect(stackCalls).toEqual([[...stack, { name: 'remarks', athlete }]]);
  });

  it('renders RemarksScreen for the remarks route (sanity check for the import above)', () => {
    const { element } = renderAppScreen([{ name: 'athletes' }, { name: 'remarks', athlete }]);
    expect(findElementsByType(element, RemarksScreen)).toHaveLength(1);
  });
});

describe('App routing: diary (RemarksScreen) navigation (see PLAN-DIARY-IA.md §5/§8)', () => {
  it('selecting a training card from the diary pushes its scoped diary (whole-training scope)', () => {
    const stack = [{ name: 'athletes' }, { name: 'remarks', athlete }];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, RemarksScreen);
    const onSelectTraining = (remarksScreens[0].props as {
      onSelectTraining: (t: TrainingRecord, focusShotNumber?: number) => void;
    }).onSelectTraining;
    onSelectTraining(training);
    expect(stackCalls).toEqual([[...stack, { name: 'trainingRemarks', athlete, training, seriesNumber: null }]]);
  });

  it('clicking a shot comment for a ПП-3 exercise scopes straight to the series containing that shot (fixes the series-view bug)', () => {
    const pp3Training: TrainingRecord = { ...training, targetShotCount: 60, nextShotNumber: 61 };
    const stack = [{ name: 'athletes' }, { name: 'remarks', athlete }];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, RemarksScreen);
    const onSelectTraining = (remarksScreens[0].props as {
      onSelectTraining: (t: TrainingRecord, focusShotNumber?: number) => void;
    }).onSelectTraining;
    // Shot #34 belongs to series 4 (31..40), not the training's "current" series.
    onSelectTraining(pp3Training, 34);
    expect(stackCalls).toEqual([[...stack, { name: 'trainingRemarks', athlete, training: pp3Training, seriesNumber: 4 }]]);
  });

  it('opening a ПП-3 series row directly from an exercise diary entry pushes trainingRemarks scoped to that series', () => {
    const stack = [{ name: 'athletes' }, { name: 'remarks', athlete }];
    const { element, stackCalls } = renderAppScreen(stack);
    const remarksScreens = findElementsByType(element, RemarksScreen);
    const onOpenSeriesDiary = (remarksScreens[0].props as {
      onOpenSeriesDiary?: (t: TrainingRecord, seriesNumber: number) => void;
    }).onOpenSeriesDiary!;
    onOpenSeriesDiary(training, 5);
    expect(stackCalls).toEqual([[...stack, { name: 'trainingRemarks', athlete, training, seriesNumber: 5 }]]);
  });
});

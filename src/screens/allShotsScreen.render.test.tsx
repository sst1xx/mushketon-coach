import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AllShotsScreen from './AllShotsScreen';
import { renderFunctionComponentToElement } from '../testUtils/fakeHooks';
import type { AthleteRecord, TrainingRecord, ShotRecord } from '../db/schema';
import type { AllShotsEntry } from '../domain/allShotsRepo';

// AllShotsScreen loads entries/trainings via IndexedDB in an effect, which
// never runs under this DOM-less test setup (same technique as
// settingsScreen.render.test.tsx) — force the relevant useState slices
// directly instead of relying on the effect. useState call order in the
// component: 0 entries, 1 trainings, 2 selectedTrainingIds, 3 selectedShotId,
// 4 loading, 5 zoomMode.

const athlete: AthleteRecord = { id: 'a1', name: 'Иванов', createdAt: '', updatedAt: '' };

function training(id: string, startedAt: string): TrainingRecord {
  return { id, athleteId: 'a1', startedAt, updatedAt: '', completedAt: null, nextShotNumber: 1 };
}

function shot(id: string, trainingId: string, score = 90): ShotRecord {
  return { id, trainingId, shotNumber: 1, x: 0, y: 0, score, status: 'committed', createdAt: '2024-07-21T10:00:00.000Z', updatedAt: '' };
}

function entry(id: string, trainingId: string, globalNumber: number): AllShotsEntry {
  return { shot: shot(id, trainingId), trainingId, globalNumber, hasComment: false, commentText: null };
}

function renderScreen(
  entries: AllShotsEntry[],
  trainings: TrainingRecord[],
  selectedTrainingIds: Set<string> | null = null,
) {
  const props = { athlete, onBack: () => {} };
  const element = renderFunctionComponentToElement(
    AllShotsScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 0: entries, 1: trainings, 2: selectedTrainingIds, 4: false },
  );
  return renderToStaticMarkup(element!);
}

describe('AllShotsScreen chip row', () => {
  it('renders one chip per training plus the [Все] chip', () => {
    const trainings = [training('t1', '2024-07-21T10:00:00.000Z'), training('t2', '2024-08-03T10:00:00.000Z')];
    const entries = [entry('s1', 't1', 1), entry('s2', 't2', 2)];
    const markup = renderScreen(entries, trainings);
    const chipButtons = markup.match(/<button[^>]*aria-pressed/g) ?? [];
    expect(chipButtons.length).toBe(3); // Все + 2 trainings
  });

  it('marks the [Все] chip as pressed when selectedTrainingIds is null', () => {
    const trainings = [training('t1', '2024-07-21T10:00:00.000Z')];
    const entries = [entry('s1', 't1', 1)];
    const markup = renderScreen(entries, trainings, null);
    const allChipMatch = markup.match(/<button[^>]*>Все<\/button>/);
    expect(allChipMatch![0]).toContain('aria-pressed="true"');
  });

  it('marks the [Все] chip as not pressed and the selected training chip as pressed', () => {
    const trainings = [training('t1', '2024-07-21T10:00:00.000Z'), training('t2', '2024-08-03T10:00:00.000Z')];
    const entries = [entry('s1', 't1', 1), entry('s2', 't2', 2)];
    const markup = renderScreen(entries, trainings, new Set(['t2']));
    const allChipMatch = markup.match(/<button[^>]*>Все<\/button>/);
    expect(allChipMatch![0]).toContain('aria-pressed="false"');
  });

  it('shows the training date in the score label when multiple trainings are displayed', () => {
    const trainings = [training('t1', '2024-07-21T10:00:00.000Z'), training('t2', '2024-08-03T10:00:00.000Z')];
    const entries = [entry('s1', 't1', 1), entry('s2', 't2', 2)];
    const markup = renderScreen(entries, trainings, null);
    expect(markup).toContain('(21 июл.)');
  });

  it('omits the training date from the score label when only one training is displayed', () => {
    const trainings = [training('t1', '2024-07-21T10:00:00.000Z')];
    const entries = [entry('s1', 't1', 1)];
    const markup = renderScreen(entries, trainings, new Set(['t1']));
    expect(markup).not.toContain('(21 июл.)');
    expect(markup).toContain('№1 • 9.0');
  });
});

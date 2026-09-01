import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RemarksScreen from './RemarksScreen';
import { renderFunctionComponentToElement } from '../testUtils/fakeHooks';
import type { AthleteRecord, GeneralCommentRecord, SeriesCommentRecord, TrainingRecord } from '../db/schema';

// RemarksScreen loads its diary entries via IndexedDB in a useEffect, which
// never runs under this project's DOM-less test setup — force `entries`/
// `shotsById`/`loading` state (useState indices 0, 1, 2) directly, same
// technique as remarksScreenDiary.test.tsx.

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

const training: TrainingRecord = {
  id: 't1', athleteId: athlete.id, startedAt: '2024-01-01T10:00:00.000Z',
  updatedAt: '2024-01-01T10:00:00.000Z', completedAt: '2024-01-01T10:05:00.000Z',
  nextShotNumber: 11, targetShotCount: 10,
};

const generalComment: GeneralCommentRecord = {
  trainingId: training.id, athleteId: athlete.id, text: 'Общее замечание тренировки',
  createdAt: '2024-01-01T10:05:00.000Z', updatedAt: '2024-01-01T10:05:00.000Z',
};

const seriesComment: SeriesCommentRecord = {
  id: 'sc1', trainingId: training.id, athleteId: athlete.id, seriesNumber: 1,
  text: 'Замечание серии 1', createdAt: '', updatedAt: '',
};

function baseProps(overrides: Partial<{
  foldedTrainings: Record<string, boolean>;
  foldedSeries: Record<string, boolean>;
  onToggleTrainingFold: (trainingId: string, currentFolded: boolean) => void;
  onToggleSeriesFold: (trainingId: string, seriesIndex: number, currentFolded: boolean) => void;
  onCollapseAll: (state: unknown) => void;
  onExpandAll: (state: unknown) => void;
  onSelectTraining: () => void;
  onOpenSeriesDiary: () => void;
}> = {}) {
  return {
    athlete,
    epoch: 1,
    onBack: () => {},
    onSelectTraining: overrides.onSelectTraining ?? (() => {}),
    onOpenGeneralRemark: () => {},
    onOpenSeriesDiary: overrides.onOpenSeriesDiary ?? (() => {}),
    onEditShotComment: () => {},
    onToggleTrainingFold: overrides.onToggleTrainingFold ?? (() => {}),
    onToggleSeriesFold: overrides.onToggleSeriesFold ?? (() => {}),
    onCollapseAll: overrides.onCollapseAll ?? (() => {}),
    onExpandAll: overrides.onExpandAll ?? (() => {}),
    foldedTrainings: overrides.foldedTrainings,
    foldedSeries: overrides.foldedSeries,
  };
}

function renderWith(entries: unknown[], props: ReturnType<typeof baseProps>) {
  const element = renderFunctionComponentToElement(
    RemarksScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 0: entries, 1: {}, 2: false },
  );
  return renderToStaticMarkup(element!);
}

describe('RemarksScreen fold/unfold', () => {
  const pp3Series = [
    { index: 1, committedCount: 3, resultLabel: '27 (27.0)', seriesComment, shotComments: [] },
  ];
  const entry = {
    training,
    generalComment,
    shotComments: [],
    resultLabel: '3 выстрелов · 27 (27.0)',
    pp3Series,
  };

  it('renders the general comment body when the training is expanded (default: has a general comment)', () => {
    const markup = renderWith([entry], baseProps());
    expect(markup).toContain('Общее замечание тренировки');
    expect(markup).toContain('aria-expanded="true"');
  });

  it('does not render the training body in the DOM when explicitly folded (criterion 7)', () => {
    const markup = renderWith([entry], baseProps({ foldedTrainings: { [training.id]: true } }));
    expect(markup).not.toContain('Общее замечание тренировки');
    expect(markup).not.toContain('Замечание серии 1');
  });

  it('folds only the series body, not the training body, when a series is explicitly folded (criterion 3)', () => {
    const markup = renderWith([entry], baseProps({ foldedSeries: { 't1:1': true } }));
    expect(markup).toContain('Общее замечание тренировки');
    expect(markup).toContain('Серия 1');
    expect(markup).not.toContain('Замечание серии 1');
  });

  it('clicking the training chevron toggles fold and does not call onSelectTraining (criterion 2)', () => {
    const onToggleTrainingFold = vi.fn();
    const onSelectTraining = vi.fn();
    const props = baseProps({ onToggleTrainingFold, onSelectTraining });
    const element = renderFunctionComponentToElement(
      RemarksScreen as unknown as (p: typeof props) => React.ReactElement,
      props,
      { 0: [entry], 1: {}, 2: false },
    );
    function findAndClick(node: unknown, ariaLabel: string): boolean {
      if (node === null || node === undefined || typeof node !== 'object') return false;
      if (Array.isArray(node)) return node.some(n => findAndClick(n, ariaLabel));
      const el = node as React.ReactElement;
      const p = el.props as { onClick?: () => void; 'aria-label'?: string; children?: unknown } | undefined;
      if (p?.['aria-label'] === ariaLabel && typeof p.onClick === 'function') {
        p.onClick();
        return true;
      }
      return findAndClick(p?.children, ariaLabel);
    }
    expect(findAndClick(element, 'Свернуть запись')).toBe(true);
    expect(onToggleTrainingFold).toHaveBeenCalledWith(training.id, false);
    expect(onSelectTraining).not.toHaveBeenCalled();
  });

  it('exposes aria-expanded/aria-controls/aria-label on both training and series chevrons (criterion 8)', () => {
    const markup = renderWith([entry], baseProps());
    expect(markup).toContain('aria-controls="diary-training-t1"');
    expect(markup).toContain('aria-controls="diary-series-t1-1"');
    expect(markup).toContain('aria-label="Свернуть запись"');
    expect(markup).toContain('aria-label="Свернуть серию"');
  });

  it('renders "Свернуть все"/"Развернуть все" buttons that call onCollapseAll/onExpandAll without navigation (criteria 11/12)', () => {
    const onCollapseAll = vi.fn();
    const onExpandAll = vi.fn();
    const onSelectTraining = vi.fn();
    const onOpenSeriesDiary = vi.fn();
    const props = baseProps({ onCollapseAll, onExpandAll, onSelectTraining, onOpenSeriesDiary });
    const element = renderFunctionComponentToElement(
      RemarksScreen as unknown as (p: typeof props) => React.ReactElement,
      props,
      { 0: [entry], 1: {}, 2: false },
    );
    function findAndClick(node: unknown, text: string): boolean {
      if (node === null || node === undefined || typeof node !== 'object') return false;
      if (Array.isArray(node)) return node.some(n => findAndClick(n, text));
      const el = node as React.ReactElement;
      const p = el.props as { onClick?: () => void; children?: unknown } | undefined;
      if (p?.children === text && typeof p.onClick === 'function') {
        p.onClick();
        return true;
      }
      return findAndClick(p?.children, text);
    }
    expect(findAndClick(element, 'Свернуть все')).toBe(true);
    expect(onCollapseAll).toHaveBeenCalledWith({
      foldedTrainings: { [training.id]: true },
      foldedSeries: { 't1:1': true },
    });
    expect(findAndClick(element, 'Развернуть все')).toBe(true);
    expect(onExpandAll).toHaveBeenCalledWith({
      foldedTrainings: { [training.id]: false },
      foldedSeries: { 't1:1': false },
    });
    expect(onSelectTraining).not.toHaveBeenCalled();
    expect(onOpenSeriesDiary).not.toHaveBeenCalled();
  });

  it('does not render fold-all buttons on an empty diary (criterion 14)', () => {
    const markup = renderWith([], baseProps());
    expect(markup).not.toContain('Свернуть все');
    expect(markup).not.toContain('Развернуть все');
    expect(markup).toContain('Нет замечаний');
  });
});

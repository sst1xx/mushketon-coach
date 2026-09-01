import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RemarksScreen from './RemarksScreen';
import { RemarkRow } from '../components/RemarkRow';
import { renderFunctionComponentToElement, findElementsByType } from '../testUtils/fakeHooks';
import type { AthleteRecord, CommentRecord, GeneralCommentRecord, ShotRecord, TrainingRecord } from '../db/schema';

// RemarksScreen loads its diary entries via IndexedDB in a useEffect, which
// (like TrainingScreen) never runs under this project's DOM-less test setup.
// Force its `entries`/`shotsById`/`loading` state (useState indices 0, 1, 2)
// directly instead, same technique as trainingScreenCompletionModal.test.tsx.

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

const seriesTraining: TrainingRecord = {
  id: 't-series', athleteId: athlete.id, startedAt: '2024-01-01T10:00:00.000Z',
  updatedAt: '2024-01-01T10:00:00.000Z', completedAt: '2024-01-01T10:05:00.000Z',
  nextShotNumber: 11, targetShotCount: 10,
};
const pp3Training: TrainingRecord = {
  id: 't-pp3', athleteId: athlete.id, startedAt: '2024-01-02T10:00:00.000Z',
  updatedAt: '2024-01-02T10:00:00.000Z', completedAt: '2024-01-02T10:30:00.000Z',
  nextShotNumber: 61, targetShotCount: 60,
};

const generalComment: GeneralCommentRecord = {
  trainingId: seriesTraining.id, athleteId: athlete.id, text: 'Спокойнее на спуске',
  createdAt: '2024-01-01T10:05:00.000Z', updatedAt: '2024-01-01T10:05:00.000Z',
};
const shot: ShotRecord = {
  id: 's1', trainingId: seriesTraining.id, shotNumber: 4, x: 100, y: -100, score: 95,
  status: 'committed', createdAt: '2024-01-01T10:02:00.000Z', updatedAt: '2024-01-01T10:02:00.000Z',
};
const shotComment: CommentRecord = {
  id: 'c1', athleteId: athlete.id, trainingId: seriesTraining.id, shotId: shot.id, text: 'Увёл вправо',
  createdAt: '2024-01-01T10:02:30.000Z', updatedAt: '2024-01-01T10:02:30.000Z',
};

function renderDiary(entries: unknown[], shotsById: Record<string, ShotRecord | undefined>, callbacks: Partial<{
  onSelectTraining: (t: TrainingRecord) => void;
  onOpenGeneralRemark: (t: TrainingRecord) => void;
}> = {}, foldedTrainings?: Record<string, boolean>) {
  const props = {
    athlete,
    epoch: 1,
    onBack: () => {},
    onSelectTraining: callbacks.onSelectTraining ?? (() => {}),
    onOpenGeneralRemark: callbacks.onOpenGeneralRemark ?? (() => {}),
    onEditShotComment: () => {},
    onToggleTrainingFold: () => {},
    onToggleSeriesFold: () => {},
    onCollapseAll: () => {},
    onExpandAll: () => {},
    foldedTrainings,
  };
  const element = renderFunctionComponentToElement(
    RemarksScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 0: entries, 1: shotsById, 2: false },
  );
  return renderToStaticMarkup(element!);
}

describe('RemarksScreen diary view', () => {
  it('shows the general comment and shot comments grouped under the same training, labelled by mode', () => {
    const markup = renderDiary(
      [{ training: seriesTraining, generalComment, shotComments: [shotComment] }],
      { [shot.id]: shot },
    );
    expect(markup).toContain('Серия');
    expect(markup).toContain('Спокойнее на спуске');
    expect(markup).toContain('Увёл вправо');
    expect(markup).toContain('№4');
  });

  it('shows the series result (shot count + score) next to a series entry that has a general remark', () => {
    const markup = renderDiary(
      [{ training: seriesTraining, generalComment, shotComments: [], resultLabel: '1 выстрелов · 9 (9.5)' }],
      {},
    );
    expect(markup).toContain('Серия');
    expect(markup).toContain('Спокойнее на спуске');
    expect(markup).toContain('1 выстрелов · 9 (9.5)');
  });

  it('labels a ПП-3 exercise entry "Упражнение" instead of "Серия"', () => {
    const markup = renderDiary(
      [{ training: pp3Training, generalComment: { ...generalComment, trainingId: pp3Training.id }, shotComments: [] }],
      {},
    );
    expect(markup).toContain('Упражнение');
    expect(markup).not.toContain('>Серия<');
  });

  it('renders both entries in the diary when both a general and a shot-only training have remarks', () => {
    const shotOnlyTraining: TrainingRecord = { ...pp3Training, id: 't-shots-only' };
    const shotOnlyComment: CommentRecord = { ...shotComment, id: 'c2', trainingId: shotOnlyTraining.id };
    const markup = renderDiary(
      [
        { training: seriesTraining, generalComment, shotComments: [shotComment] },
        { training: shotOnlyTraining, generalComment: null, shotComments: [shotOnlyComment] },
      ],
      { [shot.id]: shot },
    );
    expect(markup).toContain('Спокойнее на спуске');
    expect((markup.match(/Увёл вправо/g) ?? []).length).toBe(2);
  });

  it('opens the general remark editor (edit-later) when the general comment is clicked from the diary', () => {
    const onOpenGeneralRemark = vi.fn();
    const props = {
      athlete,
      epoch: 1,
      onBack: () => {},
      onSelectTraining: () => {},
      onOpenGeneralRemark,
      onEditShotComment: () => {},
      onToggleTrainingFold: () => {},
      onToggleSeriesFold: () => {},
      onCollapseAll: () => {},
      onExpandAll: () => {},
    };
    const element = renderFunctionComponentToElement(
      RemarksScreen as unknown as (p: typeof props) => React.ReactElement,
      props,
      { 0: [{ training: seriesTraining, generalComment, shotComments: [] }], 1: {}, 2: false },
    );
    // Find the general-comment button by locating the element whose onClick
    // was wired to onOpenGeneralRemark(entry.training) — since our fake
    // dispatcher never invokes JSX children as components, the tree is a
    // plain nested object we can search directly for that closure's target
    // by calling it and checking the callback it invokes.
    function findAndClick(node: unknown): boolean {
      if (node === null || node === undefined || typeof node !== 'object') return false;
      if (Array.isArray(node)) return node.some(findAndClick);
      const el = node as React.ReactElement;
      const props = el.props as { onClick?: () => void; onOpenEditor?: () => void; onAdd?: () => void } | undefined;
      const onClick = props?.onClick ?? props?.onOpenEditor ?? props?.onAdd;
      if (typeof onClick === 'function') {
        onOpenGeneralRemark.mockClear();
        onClick();
        if (onOpenGeneralRemark.mock.calls.length > 0) return true;
      }
      const children = (el.props as { children?: unknown } | undefined)?.children;
      return findAndClick(children);
    }
    expect(findAndClick(element)).toBe(true);
    expect(onOpenGeneralRemark).toHaveBeenCalledWith(seriesTraining);
  });

  it('shows a completed training with no comments at all with an "add general remark" action', () => {
    const emptyTraining: TrainingRecord = { ...seriesTraining, id: 't-empty' };
    // Empty completed trainings are folded by default (PLAN-DIARY-FOLD.md §4);
    // explicitly expand this one to check its body content is rendered when open.
    const markup = renderDiary(
      [{ training: emptyTraining, generalComment: null, shotComments: [] }],
      {},
      {},
      { [emptyTraining.id]: false },
    );
    expect(markup).toContain('Серия');
    expect(markup).toContain('Добавить общее замечание');
  });

  it('does not show an "add general remark" action for an unfinished training without any comments', () => {
    const inProgressTraining: TrainingRecord = { ...seriesTraining, id: 't-in-progress', completedAt: null };
    const markup = renderDiary(
      [{ training: inProgressTraining, generalComment: null, shotComments: [] }],
      {},
    );
    expect(markup).not.toContain('Добавить общее замечание');
  });

  it('nests each ПП-3 series’ own comment and its shot comments inside that series, not as a flat list before/after the series rows', () => {
    // Regression test for the reported bug: general → shot comments →
    // series list (wrong) must become general → series rows, each series'
    // own comment+shots nested inside it (see PLAN-DIARY-IA.md §9).
    const nestedShot: ShotRecord = { ...shot, id: 's-nested', shotNumber: 12, trainingId: pp3Training.id };
    const nestedComment: CommentRecord = {
      id: 'c-nested', athleteId: athlete.id, trainingId: pp3Training.id, shotId: nestedShot.id,
      text: 'Замечание внутри серии 2', createdAt: '2024-01-02T10:10:00.000Z', updatedAt: '2024-01-02T10:10:00.000Z',
    };
    const markup = renderDiary(
      [{
        training: pp3Training,
        generalComment: { ...generalComment, trainingId: pp3Training.id, text: 'Общий текст упражнения' },
        // A flat `shotComments` array is still passed on the entry (as the
        // loader produces it), but it must NOT be rendered as a separate
        // flat list once `pp3Series` rows are present — it should only
        // appear nested inside its own series row below.
        shotComments: [nestedComment],
        resultLabel: '60 выстрелов · 500 (500.0)',
        pp3Series: [
          { index: 1, committedCount: 10, resultLabel: '90 (90.0)', seriesComment: null, shotComments: [] },
          {
            index: 2, committedCount: 10, resultLabel: '91 (91.0)',
            seriesComment: { id: 'sc-2', trainingId: pp3Training.id, athleteId: athlete.id, seriesNumber: 2, text: 'Текст серии 2', createdAt: '', updatedAt: '' },
            shotComments: [nestedComment],
          },
        ],
      }],
      { [nestedShot.id]: nestedShot },
    );
    const generalIdx = markup.indexOf('Общий текст упражнения');
    const series2HeaderIdx = markup.indexOf('Серия 2');
    const series2CommentIdx = markup.indexOf('Текст серии 2');
    const nestedShotCommentIdx = markup.indexOf('Замечание внутри серии 2');
    expect(generalIdx).toBeGreaterThan(-1);
    expect(series2HeaderIdx).toBeGreaterThan(generalIdx);
    expect(series2CommentIdx).toBeGreaterThan(series2HeaderIdx);
    expect(nestedShotCommentIdx).toBeGreaterThan(series2CommentIdx);
    // The shot comment text appears exactly once — nested under its series,
    // not duplicated in a separate flat list.
    expect((markup.match(/Замечание внутри серии 2/g) ?? []).length).toBe(1);
  });

  it('opens the general remark editor to create the first general comment from the "add" action', () => {
    const emptyTraining: TrainingRecord = { ...seriesTraining, id: 't-empty' };
    const onOpenGeneralRemark = vi.fn();
    const props = {
      athlete,
      epoch: 1,
      onBack: () => {},
      onSelectTraining: () => {},
      onOpenGeneralRemark,
      onEditShotComment: () => {},
      onToggleTrainingFold: () => {},
      onToggleSeriesFold: () => {},
      onCollapseAll: () => {},
      onExpandAll: () => {},
      foldedTrainings: { [emptyTraining.id]: false },
    };
    const element = renderFunctionComponentToElement(
      RemarksScreen as unknown as (p: typeof props) => React.ReactElement,
      props,
      { 0: [{ training: emptyTraining, generalComment: null, shotComments: [] }], 1: {}, 2: false },
    );
    function findAndClick(node: unknown): boolean {
      if (node === null || node === undefined || typeof node !== 'object') return false;
      if (Array.isArray(node)) return node.some(findAndClick);
      const el = node as React.ReactElement;
      const props = el.props as { onClick?: () => void; onOpenEditor?: () => void; onAdd?: () => void } | undefined;
      const onClick = props?.onClick ?? props?.onOpenEditor ?? props?.onAdd;
      if (typeof onClick === 'function') {
        onOpenGeneralRemark.mockClear();
        onClick();
        if (onOpenGeneralRemark.mock.calls.length > 0) return true;
      }
      const children = (el.props as { children?: unknown } | undefined)?.children;
      return findAndClick(children);
    }
    expect(findAndClick(element)).toBe(true);
    expect(onOpenGeneralRemark).toHaveBeenCalledWith(emptyTraining);
  });

  it('navigates to the shot on the target (with the correct shot number) when a shot comment\'s meta-line is clicked', () => {
    // Integration test for the meta-line action wired in RemarksScreen's
    // renderShotCommentRow (see PLAN-DIARY-AFFORDANCE.md §3): clicking the
    // meta-line (not the text) must call onSelectTraining with the shot's
    // own shotNumber, not just open the training.
    const onSelectTraining = vi.fn();
    const props = {
      athlete,
      epoch: 1,
      onBack: () => {},
      onSelectTraining,
      onOpenGeneralRemark: () => {},
      onEditShotComment: () => {},
      onToggleTrainingFold: () => {},
      onToggleSeriesFold: () => {},
      onCollapseAll: () => {},
      onExpandAll: () => {},
    };
    const element = renderFunctionComponentToElement(
      RemarksScreen as unknown as (p: typeof props) => React.ReactElement,
      props,
      { 0: [{ training: seriesTraining, generalComment: null, shotComments: [shotComment] }], 1: { [shot.id]: shot }, 2: false },
    );
    const rows = findElementsByType(element, RemarkRow);
    const shotNumberMarker = `№${shot.shotNumber}`;
    const shotRow = rows.find(row => (row.props as { metaLabel?: string }).metaLabel?.includes(shotNumberMarker));
    expect(shotRow).toBeDefined();
    const onOpenMeta = (shotRow!.props as { onOpenMeta?: () => void }).onOpenMeta;
    expect(typeof onOpenMeta).toBe('function');
    onOpenMeta!();
    expect(onSelectTraining).toHaveBeenCalledWith(seriesTraining, shot.shotNumber);
  });
});

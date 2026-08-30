import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TrainingRemarksScreen from './TrainingRemarksScreen';
import { renderFunctionComponentToElement } from '../testUtils/fakeHooks';
import type { AthleteRecord, CommentRecord, GeneralCommentRecord, SeriesCommentRecord, ShotRecord, TrainingRecord } from '../db/schema';

// Same technique as generalRemarkScreen.render.test.tsx: the load effect
// never runs under this DOM-less setup, so force `loading` / `scopedShots` /
// `scopedComments` / `generalComment` / `seriesComment` / `seriesSummaries`
// (useState indices 0..5) directly.

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

function training(targetShotCount: number): TrainingRecord {
  return {
    id: 't1', athleteId: athlete.id, startedAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z', completedAt: '2024-01-01T10:05:00.000Z',
    nextShotNumber: targetShotCount + 1, targetShotCount,
  };
}

function shot(id: string, shotNumber: number, score = 95): ShotRecord {
  return { id, trainingId: 't1', shotNumber, x: 0, y: 0, score, status: 'committed', createdAt: '', updatedAt: '' };
}

function comment(id: string, shotId: string, text: string): CommentRecord {
  return { id, athleteId: athlete.id, trainingId: 't1', shotId, text, createdAt: '2024-01-01T10:01:00.000Z', updatedAt: '' };
}

function renderScreen(
  t: TrainingRecord,
  seriesNumber: number | null,
  overrides: {
    shots?: ShotRecord[];
    comments?: CommentRecord[];
    general?: GeneralCommentRecord | null;
    seriesComment?: SeriesCommentRecord | null;
    seriesSummaries?: unknown[];
    onOpenGeneralRemark?: (training: TrainingRecord, targetSeriesNumber: number | null) => void;
    onOpenTarget?: (training: TrainingRecord, seriesNumber: number | null) => void;
    onOpenSeriesDiary?: (training: TrainingRecord, seriesNumber: number) => void;
  } = {},
) {
  const props = {
    athlete,
    training: t,
    seriesNumber,
    onBack: () => {},
    onOpenGeneralRemark: overrides.onOpenGeneralRemark ?? (() => {}),
    onOpenAllRemarks: () => {},
    onOpenTarget: overrides.onOpenTarget ?? (() => {}),
    onOpenSeriesDiary: overrides.onOpenSeriesDiary,
  };
  const element = renderFunctionComponentToElement(
    TrainingRemarksScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    {
      0: false,
      1: overrides.shots ?? [],
      2: overrides.comments ?? [],
      3: overrides.general ?? null,
      4: overrides.seriesComment ?? null,
      5: overrides.seriesSummaries ?? [],
    },
  );
  return renderToStaticMarkup(element!);
}

describe('TrainingRemarksScreen', () => {
  it('titles the screen "Дневник · Серия" for a standalone series', () => {
    expect(renderScreen(training(10), null)).toContain('Дневник · Серия');
  });

  it('titles the screen "Дневник · Серия N" for a specific ПП-3 series', () => {
    expect(renderScreen(training(60), 3)).toContain('Дневник · Серия 3');
  });

  it('shows the exercise-wide general comment with a note when viewing one series', () => {
    const markup = renderScreen(training(60), 2, {
      general: { trainingId: 't1', athleteId: athlete.id, text: 'Общий текст', createdAt: '', updatedAt: '' },
    });
    expect(markup).toContain('Общее замечание по упражнению');
    expect(markup).toContain('Общий текст');
  });

  it('shows the series own independent comment separately from the exercise-wide one', () => {
    const markup = renderScreen(training(60), 2, {
      general: { trainingId: 't1', athleteId: athlete.id, text: 'Текст упражнения', createdAt: '', updatedAt: '' },
      seriesComment: { id: 't1:2', trainingId: 't1', athleteId: athlete.id, seriesNumber: 2, text: 'Текст серии 2', createdAt: '', updatedAt: '' },
    });
    expect(markup).toContain('Общее замечание серии 2');
    expect(markup).toContain('Текст серии 2');
    expect(markup).toContain('Текст упражнения');
  });

  it('offers to add the series own comment separately when it does not exist yet', () => {
    const markup = renderScreen(training(60), 2);
    expect(markup).toContain('Добавить общее замечание серии 2');
  });

  it('does not show a series-own-comment section for a standalone series or the whole exercise', () => {
    const seriesMarkup = renderScreen(training(10), null);
    expect(seriesMarkup).not.toContain('Добавить общее замечание серии');
    const exerciseMarkup = renderScreen(training(60), null);
    expect(exerciseMarkup).not.toContain('Добавить общее замечание серии');
  });

  it('offers to add a general comment when none exists yet', () => {
    const markup = renderScreen(training(10), null);
    expect(markup).toContain('Добавить общее замечание');
  });

  it('lists shot comments scoped to the given shots', () => {
    const markup = renderScreen(training(10), null, {
      shots: [shot('s1', 1), shot('s2', 2)],
      comments: [comment('c1', 's1', 'Рано начал поднимать мушку.')],
    });
    expect(markup).toContain('Рано начал поднимать мушку.');
    expect(markup).toContain('Выстрел №1');
  });

  it('has a link to open the full diary', () => {
    expect(renderScreen(training(10), null)).toContain('Открыть все замечания');
  });

  it('renders the date/result meta line as a link that opens the target scoped to this series', () => {
    const onOpenTarget = vi.fn();
    const t = training(10);
    const markup = renderScreen(t, null, {
      shots: [shot('s1', 1, 95), shot('s2', 2, 91)],
      onOpenTarget,
    });
    const linkMatch = markup.match(/<button[^>]*class="[^"]*metaLink[^"]*"[^>]*>([^<]*)<\/button>/);
    expect(linkMatch).not.toBeNull();
    expect(linkMatch![1]).toContain('01.01.2024');
    expect(linkMatch![1]).toContain('2 выстрелов');
    expect(linkMatch![1]).toContain('18 (18.6)');
  });

  it('does not offer any "add comment to shot" action for scoped shots without an existing comment', () => {
    const markup = renderScreen(training(10), null, {
      shots: [shot('s1', 1), shot('s2', 2)],
      comments: [comment('c1', 's1', 'Рано начал поднимать мушку.')],
    });
    // Only the existing comment (for shot 1) is listed; shot 2, which has no
    // comment, is not shown at all — new shot-level remarks are created only
    // from the target screen, never from here.
    expect(markup).not.toContain('Добавить замечание к выстрелу');
    expect(markup).not.toContain('Выстрелы');
    expect(markup).not.toContain('Выстрел №2');
  });

  it('offers only "edit" and "delete" actions for an existing shot comment', () => {
    const markup = renderScreen(training(10), null, {
      shots: [shot('s1', 1)],
      comments: [comment('c1', 's1', 'Рано начал поднимать мушку.')],
    });
    expect(markup).toContain('aria-label="Редактировать"');
    expect(markup).toContain('aria-label="Удалить"');
  });

  it('lists all 6 ПП-3 series with their own result, nesting each series’ own comment and shot comments inside it, when viewing the whole exercise', () => {
    const markup = renderScreen(training(60), null, {
      seriesSummaries: [
        {
          index: 1, committedCount: 10, resultLabel: '96 (96.4)',
          seriesComment: { id: 't1:1', trainingId: 't1', athleteId: athlete.id, seriesNumber: 1, text: 'Текст серии 1', createdAt: '', updatedAt: '' },
          shotComments: [comment('c1', 's1', 'Замечание к выстрелу 1')],
        },
        { index: 2, committedCount: 10, resultLabel: '94 (94.1)', seriesComment: null, shotComments: [] },
      ],
      shots: [shot('s1', 1)],
    });
    expect(markup).toContain('Серия 1');
    expect(markup).toContain('96 (96.4)');
    expect(markup).toContain('Общее замечание серии');
    expect(markup).toContain('Текст серии 1');
    expect(markup).toContain('Замечание к выстрелу 1');
    expect(markup).toContain('Серия 2');
    // Unified empty state (see PLAN-DIARY-AFFORDANCE.md §2): an absent
    // series comment is always an actionable "+ Добавить..." button, never
    // passive placeholder text.
    expect(markup).toContain('+ Добавить общее замечание серии 2');
  });

  it('does not list the 6 series when scoped to one specific series or a standalone series', () => {
    const scoped = renderScreen(training(60), 2, { seriesSummaries: [] });
    expect(scoped).not.toContain('Серия 1');
    const standalone = renderScreen(training(10), null, { seriesSummaries: [] });
    expect(standalone).not.toContain('seriesList');
  });

  it('nests a series’ own comment and shot comments strictly after that series’ header, never before it or as a separate flat list', () => {
    // Regression test for the reported bug: general → shot comments → series
    // list (wrong) must become general → series list, each series' own
    // comment+shots nested inside it (see PLAN-DIARY-IA.md §9).
    const markup = renderScreen(training(60), null, {
      general: { trainingId: 't1', athleteId: athlete.id, text: 'Общий текст упражнения', createdAt: '', updatedAt: '' },
      shots: [shot('s1', 1)],
      comments: [comment('flat1', 's1', 'Замечание вне серии')],
      seriesSummaries: [
        {
          index: 1, committedCount: 10, resultLabel: '96 (96.4)',
          seriesComment: { id: 't1:1', trainingId: 't1', athleteId: athlete.id, seriesNumber: 1, text: 'Текст серии 1', createdAt: '', updatedAt: '' },
          shotComments: [comment('nested1', 's1', 'Замечание внутри серии')],
        },
      ],
    });
    // No separate flat shot-comments list is rendered for the whole-exercise
    // scope — only the comment nested per its own series.
    expect(markup).not.toContain('Замечание вне серии');
    const generalIdx = markup.indexOf('Общий текст упражнения');
    const seriesHeaderIdx = markup.indexOf('Серия 1');
    const seriesCommentIdx = markup.indexOf('Текст серии 1');
    const nestedShotCommentIdx = markup.indexOf('Замечание внутри серии');
    expect(generalIdx).toBeGreaterThan(-1);
    expect(seriesHeaderIdx).toBeGreaterThan(generalIdx);
    expect(seriesCommentIdx).toBeGreaterThan(seriesHeaderIdx);
    expect(nestedShotCommentIdx).toBeGreaterThan(seriesCommentIdx);
  });
});

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TrainingScreen from './TrainingScreen';
import Modal from '../components/Modal';
import { renderFunctionComponentToElement, findElementsByType } from '../testUtils/fakeHooks';
import type { AthleteRecord, TrainingRecord } from '../db/schema';
import { completeTraining } from '../domain/trainingRepo';

vi.mock('../db/open', () => ({ openDB: vi.fn(async () => ({ mocked: true })) }));
vi.mock('../db/tx', () => ({ readEpoch: vi.fn(async () => 1) }));
vi.mock('../domain/trainingRepo', async () => {
  const actual = await vi.importActual<typeof import('../domain/trainingRepo')>('../domain/trainingRepo');
  return {
    ...actual,
    createTraining: vi.fn(async (_athleteId: string, _epoch: number, targetShotCount: number) => ({
      id: 'new-training',
      athleteId: 'a1',
      startedAt: '',
      updatedAt: '',
      completedAt: null,
      nextShotNumber: 1,
      targetShotCount,
    })),
    completeTraining: vi.fn(async (id: string) => ({
      id,
      athleteId: 'a1',
      startedAt: '',
      updatedAt: '',
      completedAt: 'done',
      nextShotNumber: 100,
      targetShotCount: 99,
    })),
    getTraining: vi.fn(async () => undefined),
  };
});

// TrainingScreen useState indices:
//   4  loading
//   9  showCompletedModal
//   11 showNewChoiceModal
//   12 showPristrelkaExitConfirm
//   13 selectedSeriesView

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

function buildTraining(targetShotCount: number, completed = false): TrainingRecord {
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

function renderTrainingScreen(
  training: TrainingRecord,
  overrides: Record<number, unknown> = {},
  extraProps: Partial<React.ComponentProps<typeof TrainingScreen>> = {},
) {
  const props = {
    athlete,
    training,
    epoch: 1,
    onBack: () => {},
    onOpenGeneralRemark: () => {},
    ...extraProps,
  };
  return renderFunctionComponentToElement(
    TrainingScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 4: false, ...overrides },
  );
}

describe('TrainingScreen completion modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leaves only «Просмотр» as a Modal.actions dismiss action once a series completes', () => {
    const element = renderTrainingScreen(buildTraining(10, true), { 9: true });
    const modal = findElementsByType(element, Modal)[0];
    const labels = (modal.props as { actions: { label: string }[] }).actions.map((a) => a.label);
    expect(labels).toEqual(['Просмотр']);
  });

  it('shows «Общее замечание» and «Начать новую» as vertical-stack buttons in that order', () => {
    const element = renderTrainingScreen(buildTraining(10, true), { 9: true });
    const modal = findElementsByType(element, Modal)[0];
    const markup = renderToStaticMarkup(modal.props.children as React.ReactElement);
    const remarkIdx = markup.indexOf('Общее замечание');
    const newIdx = markup.indexOf('Начать новую');
    expect(remarkIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeGreaterThan(-1);
    expect(remarkIdx).toBeLessThan(newIdx);
    expect(markup).not.toContain('Анализ с AI');
  });

  it('labels the completion dialog differently for series, ПП-3 and пристрелка', () => {
    const seriesMarkup = renderToStaticMarkup(findElementsByType(renderTrainingScreen(buildTraining(10, true), { 9: true }), Modal)[0].props.children as React.ReactElement);
    const pp3Markup = renderToStaticMarkup(findElementsByType(renderTrainingScreen(buildTraining(60, true), { 9: true }), Modal)[0].props.children as React.ReactElement);
    const pristrelkaMarkup = renderToStaticMarkup(findElementsByType(renderTrainingScreen(buildTraining(99, true), { 9: true }), Modal)[0].props.children as React.ReactElement);
    expect(seriesMarkup).toContain('серия завершена');
    expect(pp3Markup).toContain('упражнение ПП-3 завершено');
    expect(pristrelkaMarkup).toContain('пристрелка завершена');
  });

  it('offers only «Серия» and «Упражнение ПП-3» in the next-training choice modal', () => {
    const element = renderTrainingScreen(buildTraining(99, true), { 11: true });
    const choiceModal = findElementsByType(element, Modal)[1];
    const markup = renderToStaticMarkup(choiceModal.props.children as React.ReactElement);
    expect(markup).toContain('Серия');
    expect(markup).toContain('Упражнение ПП-3');
    expect(markup).not.toContain('Пристрелка');
    expect(markup).not.toContain('Начать новую');
  });
});

describe('TrainingScreen pristrelka early completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('intercepts «Назад» for an active пристрелка instead of calling onBack immediately', () => {
    const onBack = vi.fn();
    const element = renderTrainingScreen(buildTraining(99, false), {}, { onBack });
    const buttons = findElementsByType(element, 'button');
    const backButton = buttons.find((b) => (b.props as { children?: unknown }).children === '◀ Назад');
    expect(backButton).toBeDefined();
    (backButton!.props as { onClick: () => void }).onClick();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('shows a pristrelka completion confirmation dialog with «Завершить» and «Отмена»', () => {
    const element = renderTrainingScreen(buildTraining(99, false), { 12: true });
    const confirmModal = findElementsByType(element, Modal)[2];
    const labels = (confirmModal.props as { actions: { label: string }[] }).actions.map((a) => a.label);
    const markup = renderToStaticMarkup(confirmModal.props.children as React.ReactElement);
    expect(markup).toContain('Завершить пристрелку?');
    expect(labels).toEqual(['Отмена', 'Завершить']);
  });

  it('«Завершить» completes the current пристрелка via existing completion flow', async () => {
    const element = renderTrainingScreen(buildTraining(99, false), { 12: true });
    const confirmModal = findElementsByType(element, Modal)[2];
    const finishAction = (confirmModal.props as { actions: { label: string; onClick: () => Promise<void> }[] }).actions.find((a) => a.label === 'Завершить');
    expect(finishAction).toBeDefined();
    await finishAction!.onClick();
    expect(completeTraining).toHaveBeenCalledWith('t1', 1);
  });

  it('completed pristrelka uses «Назад» normally', () => {
    const onBack = vi.fn();
    const element = renderTrainingScreen(buildTraining(99, true), {}, { onBack });
    const buttons = findElementsByType(element, 'button');
    const backButton = buttons.find((b) => (b.props as { children?: unknown }).children === '◀ Назад');
    expect(backButton).toBeDefined();
    (backButton!.props as { onClick: () => void }).onClick();
    expect(onBack).toHaveBeenCalledOnce();
  });
});

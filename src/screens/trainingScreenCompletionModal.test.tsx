import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TrainingScreen from './TrainingScreen';
import Modal from '../components/Modal';
import { renderFunctionComponentToElement, findElementsByType } from '../testUtils/fakeHooks';
import type { AthleteRecord, TrainingRecord } from '../db/schema';

// TrainingScreen loads shots/settings via IndexedDB in a useEffect and only
// shows its content once `loading` becomes false. This project's test stack
// has no DOM environment, so that effect can never actually run under
// renderToStaticMarkup. Instead we call the component directly under a fake
// hooks dispatcher (see src/testUtils/fakeHooks.ts, same technique as
// targetCanvasReadOnly.test.tsx) and force specific useState slices (by call
// order) to the values they hold once the relevant modal is actually visible
// in the app — without ever touching the DB.
//
// useState indices in TrainingScreen:
//   4  loading                 ← forced false in tests
//   9  showCompletedModal      ← forced true in tests

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

function completedTraining(targetShotCount: number): TrainingRecord {
  return {
    id: 't1',
    athleteId: athlete.id,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    nextShotNumber: targetShotCount + 1,
    targetShotCount,
  };
}

function renderTrainingScreen(
  training: TrainingRecord,
  onOpenGeneralRemark: (t: TrainingRecord) => void,
  stateOverrides: Record<number, unknown> = {},
) {
  const props = {
    athlete,
    training,
    epoch: 1,
    onBack: () => {},
    onOpenGeneralRemark,
  };
  return renderFunctionComponentToElement(
    TrainingScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 4: false, 9: true, ...stateOverrides },
  );
}

function renderCompletionModal(training: TrainingRecord, onOpenGeneralRemark: (t: TrainingRecord) => void) {
  const element = renderTrainingScreen(training, onOpenGeneralRemark);
  const modals = findElementsByType(element, Modal);
  // The completion modal is the first Modal in TrainingScreen's JSX.
  return modals[0];
}

describe('TrainingScreen completion modal', () => {
  it('leaves only «Просмотр» as a Modal.actions dismiss action once a series completes', () => {
    const onOpenGeneralRemark = vi.fn();
    const modal = renderCompletionModal(completedTraining(10), onOpenGeneralRemark);
    const labels = (modal.props as { actions: { label: string }[] }).actions.map((a) => a.label);
    expect(labels).toEqual(['Просмотр']);
  });

  it('shows «Общее замечание» and «Начать новую» as vertical-stack buttons in that order', () => {
    const modal = renderCompletionModal(completedTraining(10), () => {});
    const markup = renderToStaticMarkup(modal.props.children as React.ReactElement);
    const remarkIdx = markup.indexOf('Общее замечание');
    const newIdx = markup.indexOf('Начать новую');
    expect(remarkIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeGreaterThan(-1);
    expect(remarkIdx).toBeLessThan(newIdx);
    expect(markup).not.toContain('Анализ с AI');
  });

  it('«Общее замечание» action calls onOpenGeneralRemark with the current training without closing into edit mode first', () => {
    const onOpenGeneralRemark = vi.fn();
    const training = completedTraining(10);
    const modal = renderCompletionModal(training, onOpenGeneralRemark);
    const children = modal.props.children as React.ReactElement;
    const buttons = findElementsByType(children, 'button');
    const remarkButton = buttons.find(
      (b) => (b.props as { children?: unknown }).children === 'Общее замечание',
    )!;
    (remarkButton.props as { onClick: () => void }).onClick();
    expect(onOpenGeneralRemark).toHaveBeenCalledWith(training);
  });

  it('labels the completion dialog for a ПП-3 exercise differently from a series', () => {
    const seriesModal = renderCompletionModal(completedTraining(10), () => {});
    const pp3Modal = renderCompletionModal(completedTraining(60), () => {});
    const seriesMarkup = renderToStaticMarkup(seriesModal.props.children as React.ReactElement);
    const pp3Markup = renderToStaticMarkup(pp3Modal.props.children as React.ReactElement);
    expect(seriesMarkup).toContain('серия завершена');
    expect(pp3Markup).toContain('упражнение ПП-3 завершено');
  });
});

describe('TrainingScreen «Начать новую» choice modal', () => {
  it('shows «Серия» and «Упражнение ПП-3» in the choice modal without a heading', () => {
    const element = renderTrainingScreen(completedTraining(10), () => {}, { 11: true });
    const modals = findElementsByType(element, Modal);
    // showNewChoiceModal is the second Modal in TrainingScreen JSX
    const choiceModal = modals[1];
    expect(choiceModal).toBeDefined();
    const markup = renderToStaticMarkup(choiceModal.props.children as React.ReactElement);
    expect(markup).toContain('Серия');
    expect(markup).toContain('Упражнение ПП-3');
    expect(markup).not.toContain('+ Новая серия');
    expect(markup).not.toContain('+ Новое упражнение');
    expect(markup).not.toContain('Начать новую');
  });
});

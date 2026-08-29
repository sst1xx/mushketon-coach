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
// targetCanvasReadOnly.test.tsx) and force `loading` (useState index 4) and
// `showCompletedModal` (index 9) to the values they hold once the completion
// modal is actually visible in the app — without ever touching the DB.

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

function renderCompletionModal(training: TrainingRecord, onOpenGeneralRemark: (t: TrainingRecord) => void) {
  const props = {
    athlete,
    training,
    epoch: 1,
    onBack: () => {},
    onOpenGeneralRemark,
  };
  const element = renderFunctionComponentToElement(
    TrainingScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 4: false, 9: true },
  );
  const modals = findElementsByType(element, Modal);
  // The completion modal is the first Modal in TrainingScreen's JSX.
  return modals[0];
}

describe('TrainingScreen completion modal', () => {
  it('shows «Просмотр», «Общее замечание» and «Начать новую» actions once a series completes', () => {
    const onOpenGeneralRemark = vi.fn();
    const modal = renderCompletionModal(completedTraining(10), onOpenGeneralRemark);
    const labels = (modal.props as { actions: { label: string }[] }).actions.map((a) => a.label);
    expect(labels).toEqual(['Просмотр', 'Общее замечание', 'Начать новую']);
  });

  it('«Общее замечание» action calls onOpenGeneralRemark with the current training without closing into edit mode first', () => {
    const onOpenGeneralRemark = vi.fn();
    const training = completedTraining(10);
    const modal = renderCompletionModal(training, onOpenGeneralRemark);
    const remarkAction = (modal.props as { actions: { label: string; onClick: () => void }[] }).actions
      .find((a) => a.label === 'Общее замечание')!;
    remarkAction.onClick();
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

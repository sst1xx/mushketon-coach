import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TrainingsScreen from './TrainingsScreen';
import Modal from '../components/Modal';
import { renderFunctionComponentToElement, findElementsByType } from '../testUtils/fakeHooks';
import type { AthleteRecord, TrainingRecord } from '../db/schema';

// TrainingsScreen useState call order:
//   0  trainings          ← []
//   1  totals             ← {}
//   2  modeLabels         ← {}
//   3  loading            ← forced false
//   4  confirmDelete      ← null
//   5  showNewModal       ← controlled per test

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

const defaultProps = {
  athlete,
  epoch: 1,
  onBack: () => {},
  onSelectTraining: (_t: TrainingRecord) => {},
};

function renderScreen(stateOverrides: Record<number, unknown> = {}) {
  return renderFunctionComponentToElement(
    TrainingsScreen as unknown as (p: typeof defaultProps) => React.ReactElement,
    defaultProps,
    { 3: false, ...stateOverrides },
  );
}

describe('TrainingsScreen «+ Новое» button', () => {
  it('renders exactly one «+ Новое» button and no old «+ Новая серия» / «+ Новое упражнение»', () => {
    const element = renderScreen();
    const markup = renderToStaticMarkup(element as React.ReactElement);
    expect(markup).toContain('+ Новое');
    expect(markup).not.toContain('+ Новая серия');
    expect(markup).not.toContain('+ Новое упражнение');
  });

  it('shows «Серия» and «Упражнение ПП-3» in the choice modal when showNewModal is true, without a heading', () => {
    const element = renderScreen({ 5: true });
    const modals = findElementsByType(element, Modal);
    // The choice modal is the one that contains the choice buttons
    const choiceModal = modals.find((m) => {
      const children = (m.props as { children?: unknown }).children;
      if (!children) return false;
      const markup = renderToStaticMarkup(children as React.ReactElement);
      return markup.includes('Серия');
    });
    expect(choiceModal).toBeDefined();
    const childrenMarkup = renderToStaticMarkup(
      (choiceModal!.props as { children: React.ReactElement }).children,
    );
    expect(childrenMarkup).toContain('Серия');
    expect(childrenMarkup).toContain('Упражнение ПП-3');
    expect(childrenMarkup).not.toContain('Начать новое');
  });

  it('does not show «Начать новое» heading in the choice modal', () => {
    const element = renderScreen({ 5: true });
    const markup = renderToStaticMarkup(element as React.ReactElement);
    expect(markup).not.toContain('Начать новое');
  });
});

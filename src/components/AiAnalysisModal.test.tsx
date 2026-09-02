import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AiAnalysisModal from './AiAnalysisModal';
import type { AthleteRecord } from '../db/schema';

const athlete: AthleteRecord = {
  id: 'a1',
  name: 'Иван',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

describe('AiAnalysisModal (renderToStaticMarkup structure)', () => {
  it('renders the loading state before effects run (no DOM environment)', () => {
    const markup = renderToStaticMarkup(
      <AiAnalysisModal athlete={athlete} apiKey="sk-test" model="model-x" onClose={() => {}} />,
    );
    expect(markup).toContain('Загрузка тренировок');
  });

  it('renders as a modal dialog', () => {
    const markup = renderToStaticMarkup(
      <AiAnalysisModal athlete={athlete} apiKey="sk-test" model="model-x" onClose={() => {}} />,
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('Анализ с AI');
  });
});

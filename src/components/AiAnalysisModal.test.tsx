import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AiAnalysisModal, { renderSections } from './AiAnalysisModal';
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

describe('renderSections', () => {
  it('пустая строка → пустой массив', () => {
    expect(renderSections('')).toHaveLength(0);
  });

  it('plain text без заголовков → один <p>', () => {
    const html = renderToStaticMarkup(<>{renderSections('Просто текст')}</>);
    expect(html).toContain('<p');
    expect(html).toContain('Просто текст');
    expect(html).not.toContain('<h2');
  });

  it('одна секция с заголовком и телом', () => {
    const html = renderToStaticMarkup(<>{renderSections('## Итог тренировки\nТекст итога')}</>);
    expect(html).toContain('<h2');
    expect(html).toContain('Итог тренировки');
    expect(html).toContain('Текст итога');
  });

  it('заголовок без тела → только <h2>, нет <p>', () => {
    const html = renderToStaticMarkup(<>{renderSections('## Заголовок')}</>);
    expect(html).toContain('<h2');
    expect(html).not.toContain('<p');
  });

  it('несколько секций → несколько <h2>', () => {
    const src = '## Первая\nТекст первой\n## Вторая\nТекст второй';
    const html = renderToStaticMarkup(<>{renderSections(src)}</>);
    expect(html).toContain('Первая');
    expect(html).toContain('Вторая');
    expect((html.match(/<h2/g) ?? []).length).toBe(2);
  });

  it('текст перед первым заголовком не теряется', () => {
    const src = 'Вводный текст\n## Раздел\nТело';
    const html = renderToStaticMarkup(<>{renderSections(src)}</>);
    expect(html).toContain('Вводный текст');
    expect(html).toContain('Раздел');
  });

  it('два заголовка подряд без тела между ними', () => {
    const src = '## А\n## Б\nТело Б';
    const html = renderToStaticMarkup(<>{renderSections(src)}</>);
    expect((html.match(/<h2/g) ?? []).length).toBe(2);
    expect(html).toContain('Тело Б');
  });
});

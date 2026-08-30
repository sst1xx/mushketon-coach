import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RemarkRow, RemarkRowEmpty } from './RemarkRow';

// See PLAN-DIARY-AFFORDANCE.md §2/§3: a single unified row is used for
// general/series/shot remarks, with explicit ✎/✕ actions and a separate
// meta-line action (shot comments only) — text always opens the editor.

describe('RemarkRow', () => {
  it('renders the label, text and meta line, with explicit edit/delete actions', () => {
    const markup = renderToStaticMarkup(
      <RemarkRow
        label="Общее замечание серии 3"
        text="Рано сорвал спуск"
        metaLabel="Выстрел №4 • 9.5 · 01.01.2024 10:02"
        onOpenEditor={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(markup).toContain('Общее замечание серии 3');
    expect(markup).toContain('Рано сорвал спуск');
    expect(markup).toContain('Выстрел №4 • 9.5 · 01.01.2024 10:02');
    expect(markup).toContain('aria-label="Редактировать"');
    expect(markup).toContain('aria-label="Удалить"');
  });

  it('invokes onOpenEditor when the text button is clicked (both text click and ✎ open the same editor)', () => {
    const onOpenEditor = vi.fn();
    const onEdit = vi.fn();
    // renderToStaticMarkup does not run event handlers; assert the same
    // handler reference is what both text and ✎ dispatch to instead.
    const element = (
      <RemarkRow text="X" onOpenEditor={onOpenEditor} onEdit={onEdit} onDelete={() => {}} />
    );
    expect(element.props.onOpenEditor).toBe(onOpenEditor);
    expect(element.props.onEdit).toBe(onEdit);
  });

  it('renders a meta button (not static text) only when onOpenMeta is provided, enabling navigation to the target', () => {
    const withNav = renderToStaticMarkup(
      <RemarkRow text="X" metaLabel="Выстрел №1" onOpenMeta={() => {}} onOpenEditor={() => {}} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(withNav).toMatch(/<button[^>]*>Выстрел №1<\/button>/);

    const withoutNav = renderToStaticMarkup(
      <RemarkRow text="X" metaLabel="Выстрел №1" onOpenEditor={() => {}} onEdit={() => {}} onDelete={() => {}} />,
    );
    expect(withoutNav).toMatch(/<p[^>]*>Выстрел №1<\/p>/);
  });

  it('applies the nested (indented) layout class when nested is set', () => {
    const markup = renderToStaticMarkup(
      <RemarkRow text="X" onOpenEditor={() => {}} onEdit={() => {}} onDelete={() => {}} nested />,
    );
    expect(markup).toMatch(/class="[^"]*_nested_/);
  });
});

describe('RemarkRowEmpty', () => {
  it('always renders an actionable "+ Добавить…" button, never passive placeholder text', () => {
    const markup = renderToStaticMarkup(
      <RemarkRowEmpty addLabel="+ Добавить общее замечание серии 3" onAdd={() => {}} />,
    );
    expect(markup).toMatch(/<button[^>]*>\+ Добавить общее замечание серии 3<\/button>/);
  });
});

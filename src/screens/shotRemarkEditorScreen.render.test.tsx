import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShotRemarkEditorScreen from './ShotRemarkEditorScreen';
import { renderFunctionComponentToElement } from '../testUtils/fakeHooks';
import type { AthleteRecord, CommentRecord, ShotRecord } from '../db/schema';

// Full-screen editor for an existing shot comment, opened from the diary
// (see PLAN-DIARY-AFFORDANCE.md §2). Shot comments are still only *created*
// from the target screen; this screen only edits an already-existing one.

const athlete: AthleteRecord = { id: 'a1', name: 'Coach', createdAt: '', updatedAt: '' };

const comment: CommentRecord = {
  id: 'c1', athleteId: athlete.id, trainingId: 't1', shotId: 's1', text: 'Увёл вправо',
  createdAt: '2024-01-01T10:02:30.000Z', updatedAt: '2024-01-01T10:02:30.000Z',
};

const shot: ShotRecord = {
  id: 's1', trainingId: 't1', shotNumber: 4, x: 100, y: -100, score: 95,
  status: 'committed', createdAt: '', updatedAt: '',
};

function renderScreen(overrideShot: ShotRecord | undefined, existingText = comment.text) {
  const props = { athlete, comment: { ...comment, text: existingText }, shot: overrideShot, onBack: () => {} };
  const element = renderFunctionComponentToElement(
    ShotRemarkEditorScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 0: existingText },
  );
  return renderToStaticMarkup(element!);
}

describe('ShotRemarkEditorScreen', () => {
  it('shows the shot label, score and date as meta, and pre-fills the existing comment text', () => {
    const markup = renderScreen(shot);
    expect(markup).toContain('Выстрел №4');
    expect(markup).toContain('9.5');
    expect(markup).toContain('01.01.2024');
    expect(markup).toContain('Увёл вправо');
  });

  it('degrades the shot label gracefully when the shot no longer exists', () => {
    const markup = renderScreen(undefined);
    expect(markup).toContain('Выстрел удалён');
  });

  it('disables Save while the text is empty, so it can never silently delete the comment', () => {
    const markup = renderScreen(shot, '');
    const saveMatch = markup.match(/<button[^>]*disabled=""[^>]*>Сохранить<\/button>/);
    expect(saveMatch).not.toBeNull();
  });

  it('does not disable Save once there is non-empty text', () => {
    const markup = renderScreen(shot, 'Текст');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Сохранить<\/button>/);
  });
});

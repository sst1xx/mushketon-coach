import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ShotsList from './ShotsList';
import type { ShotRecord } from '../db/schema';

function shot(overrides: Partial<ShotRecord>): ShotRecord {
  return {
    id: overrides.id ?? 's1',
    trainingId: 't1',
    shotNumber: overrides.shotNumber ?? 1,
    x: 0,
    y: 0,
    score: overrides.score ?? 105,
    status: overrides.status ?? 'committed',
    createdAt: '',
    updatedAt: '',
  };
}

describe('ShotsList', () => {
  it('fills the left column first, then the right column, in shot order', () => {
    const shots = Array.from({ length: 10 }, (_, i) =>
      shot({ id: `s${i + 1}`, shotNumber: i + 1, score: 100 + i }),
    );
    const left = renderToStaticMarkup(<ShotsList shots={shots} side="left" />);
    const right = renderToStaticMarkup(<ShotsList shots={shots} side="right" />);
    for (let n = 1; n <= 5; n++) expect(left).toContain(`№${n} • `);
    for (let n = 6; n <= 10; n++) expect(right).toContain(`№${n} • `);
    for (let n = 6; n <= 10; n++) expect(left).not.toContain(`№${n} •`);
    for (let n = 1; n <= 5; n++) expect(right).not.toContain(`№${n} •`);
  });

  it('gives the left column the extra shot when the count is odd', () => {
    const shots = [
      shot({ id: 's1', shotNumber: 1, score: 105 }),
      shot({ id: 's2', shotNumber: 2, score: 0 }),
      shot({ id: 's3', shotNumber: 3, score: 90 }),
    ];
    const left = renderToStaticMarkup(<ShotsList shots={shots} side="left" />);
    const right = renderToStaticMarkup(<ShotsList shots={shots} side="right" />);
    expect(left).toContain('№1 • 10.5');
    expect(left).toContain('№2 • 0.0');
    expect(left).not.toContain('№3');
    expect(right).toContain('№3 • 9.0');
    expect(right).not.toContain('№1');
    expect(right).not.toContain('№2');
  });

  it('excludes draft shots from both columns', () => {
    const shots = [shot({ id: 's1', shotNumber: 1, score: 105, status: 'draft' })];
    const left = renderToStaticMarkup(<ShotsList shots={shots} side="left" />);
    const right = renderToStaticMarkup(<ShotsList shots={shots} side="right" />);
    expect(left).not.toContain('№1');
    expect(right).not.toContain('№1');
  });

  it('renders no items for an empty list', () => {
    const left = renderToStaticMarkup(<ShotsList shots={[]} side="left" />);
    const right = renderToStaticMarkup(<ShotsList shots={[]} side="right" />);
    expect(left).not.toContain('<li');
    expect(right).not.toContain('<li');
  });

  it('side="all" renders every committed shot in order, unsplit', () => {
    const shots = [
      shot({ id: 's1', shotNumber: 1, score: 105 }),
      shot({ id: 's2', shotNumber: 2, score: 0 }),
      shot({ id: 's3', shotNumber: 3, score: 90, status: 'draft' }),
    ];
    const all = renderToStaticMarkup(<ShotsList shots={shots} side="all" />);
    expect(all).toContain('№1 • 10.5');
    expect(all).toContain('№2 • 0.0');
    expect(all).not.toContain('№3');
  });
});

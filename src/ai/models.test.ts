import { describe, it, expect } from 'vitest';
import { selectModel, DEFAULT_MODEL } from './models';

describe('selectModel', () => {
  const ids = ['openrouter/free', 'minimax/minimax-m3:free', 'a/other'];

  it('returns savedModel when it is in the list', () => {
    expect(selectModel('minimax/minimax-m3:free', ids)).toBe('minimax/minimax-m3:free');
  });

  it('returns DEFAULT_MODEL when savedModel is absent but DEFAULT_MODEL is in the list', () => {
    expect(selectModel('unknown/model', ids)).toBe(DEFAULT_MODEL);
    expect(selectModel(null, ids)).toBe(DEFAULT_MODEL);
  });

  it('returns first item when savedModel absent and DEFAULT_MODEL absent', () => {
    const noDefault = ['minimax/minimax-m3:free', 'a/other'];
    expect(selectModel(null, noDefault)).toBe('minimax/minimax-m3:free');
    expect(selectModel('unknown/model', noDefault)).toBe('minimax/minimax-m3:free');
  });

  it('returns null for empty list', () => {
    expect(selectModel(null, [])).toBeNull();
    expect(selectModel('any/model', [])).toBeNull();
  });
});

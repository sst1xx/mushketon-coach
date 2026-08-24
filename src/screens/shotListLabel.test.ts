import { describe, it, expect } from 'vitest';
import { shotListLabel } from './shotListLabel';

describe('shotListLabel', () => {
  it('formats a normal score', () => {
    expect(shotListLabel(17, 104)).toBe('№17 • 10.4');
  });

  it('formats a miss (score 0) as 0.0', () => {
    expect(shotListLabel(3, 0)).toBe('№3 • 0.0');
  });

  it('formats a small shot number', () => {
    expect(shotListLabel(1, 91)).toBe('№1 • 9.1');
  });
});

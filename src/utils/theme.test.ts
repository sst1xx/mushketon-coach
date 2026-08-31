import { describe, it, expect } from 'vitest';
import { isThemeMode } from './theme';

// applyTheme's DOM write (document.documentElement.dataset.theme) is not unit
// tested here: this project's vitest environment has no DOM (see AGENTS.md
// §2), same reason Modal.tsx's document usage isn't exercised directly in
// tests either. isThemeMode is the pure, testable part of this module.
describe('isThemeMode', () => {
  it('accepts only light/dark', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isThemeMode('system')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
    expect(isThemeMode(1)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME_MODE, THEME_COLOR_BY_MODE, applyTheme, isThemeMode } from './theme';

describe('theme utils', () => {
  it('defines dark as DEFAULT_THEME_MODE', () => {
    expect(DEFAULT_THEME_MODE).toBe('dark');
  });

  it('maps theme colors to toolbar colors for light and dark modes', () => {
    expect(THEME_COLOR_BY_MODE.light).toBe('#1a1a2e');
    expect(THEME_COLOR_BY_MODE.dark).toBe('#0d1a10');
  });

  describe('applyTheme', () => {
    it('sets documentElement dataset.theme and updates meta[name="theme-color"] if present', () => {
      const mockMeta = {
        setAttribute: (attr: string, val: string) => {
          attrs[attr] = val;
        },
      };
      const attrs: Record<string, string> = {};
      const mockDoc = {
        documentElement: {
          dataset: {} as Record<string, string>,
        },
        querySelector: (selector: string) => {
          if (selector === 'meta[name="theme-color"]') return mockMeta;
          return null;
        },
      };

      const originalDoc = (globalThis as unknown as { document?: unknown }).document;
      try {
        (globalThis as unknown as { document: unknown }).document = mockDoc;

        applyTheme('light');
        expect(mockDoc.documentElement.dataset.theme).toBe('light');
        expect(attrs['content']).toBe('#1a1a2e');

        applyTheme('dark');
        expect(mockDoc.documentElement.dataset.theme).toBe('dark');
        expect(attrs['content']).toBe('#0d1a10');
      } finally {
        if (originalDoc !== undefined) {
          (globalThis as unknown as { document: unknown }).document = originalDoc;
        } else {
          delete (globalThis as unknown as { document?: unknown }).document;
        }
      }
    });

    it('safely handles missing meta[name="theme-color"] tag', () => {
      const mockDoc = {
        documentElement: {
          dataset: {} as Record<string, string>,
        },
        querySelector: () => null,
      };

      const originalDoc = (globalThis as unknown as { document?: unknown }).document;
      try {
        (globalThis as unknown as { document: unknown }).document = mockDoc;
        expect(() => applyTheme('light')).not.toThrow();
        expect(mockDoc.documentElement.dataset.theme).toBe('light');
      } finally {
        if (originalDoc !== undefined) {
          (globalThis as unknown as { document: unknown }).document = originalDoc;
        } else {
          delete (globalThis as unknown as { document?: unknown }).document;
        }
      }
    });
  });

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
});

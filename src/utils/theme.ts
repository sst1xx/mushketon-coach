/**
 * Theme mode application. Pure aside from the one DOM write needed to
 * flip the CSS custom-property set defined in src/styles/tokens.css.
 */

export type ThemeMode = 'light' | 'dark';

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';

export const THEME_COLOR_BY_MODE: Record<ThemeMode, string> = {
  light: '#1a1a2e',
  dark: '#0d1a10',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', THEME_COLOR_BY_MODE[mode]);
  }
}

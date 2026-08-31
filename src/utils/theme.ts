/**
 * Theme mode application. Pure aside from the one DOM write needed to
 * flip the CSS custom-property set defined in src/styles/tokens.css.
 */

export type ThemeMode = 'light' | 'dark';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.dataset.theme = mode;
}

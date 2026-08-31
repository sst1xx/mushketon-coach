import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsScreen from './SettingsScreen';
import { renderFunctionComponentToElement } from '../testUtils/fakeHooks';

// SettingsScreen loads storage/theme settings via IndexedDB in an effect,
// which never runs under this DOM-less test setup (same technique as
// generalRemarkScreen.render.test.tsx) — force `themeMode` (useState index 4:
// status, storageInfo, storagePersisted, confirmRestore, themeMode) directly
// instead of relying on the effect.

function renderScreen(themeMode: 'light' | 'dark') {
  const props = { onBack: () => {} };
  const element = renderFunctionComponentToElement(
    SettingsScreen as unknown as (p: typeof props) => React.ReactElement,
    props,
    { 4: themeMode },
  );
  return renderToStaticMarkup(element!);
}

describe('SettingsScreen theme buttons', () => {
  it('marks "Светлая" as pressed and "Тёмная" as not pressed when themeMode is light', () => {
    const markup = renderScreen('light');
    const lightMatch = markup.match(/<button[^>]*>Светлая<\/button>/);
    const darkMatch = markup.match(/<button[^>]*>Тёмная<\/button>/);
    expect(lightMatch![0]).toContain('aria-pressed="true"');
    expect(darkMatch![0]).toContain('aria-pressed="false"');
  });

  it('marks "Тёмная" as pressed and "Светлая" as not pressed when themeMode is dark', () => {
    const markup = renderScreen('dark');
    const lightMatch = markup.match(/<button[^>]*>Светлая<\/button>/);
    const darkMatch = markup.match(/<button[^>]*>Тёмная<\/button>/);
    expect(darkMatch![0]).toContain('aria-pressed="true"');
    expect(lightMatch![0]).toContain('aria-pressed="false"');
  });

  it('renders both theme options as buttons with accessible labels', () => {
    const markup = renderScreen('light');
    expect(markup).toContain('Светлая');
    expect(markup).toContain('Тёмная');
  });
});

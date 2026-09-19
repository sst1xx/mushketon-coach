import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import UnsupportedBrowserScreen from './UnsupportedBrowserScreen';

describe('UnsupportedBrowserScreen (renderToStaticMarkup)', () => {
  it('renders generic unsupported screen when isTelegram is false', () => {
    const html = renderToStaticMarkup(<UnsupportedBrowserScreen isTelegram={false} />);
    expect(html).toContain('Браузер не поддерживается');
    expect(html).toContain('Для работы приложения необходимы IndexedDB и Service Worker.');
    expect(html).toContain('Safari на iOS 16.4+');
    expect(html).not.toContain('Telegram');
    expect(html).not.toContain('Остался один маленький шаг');
    expect(html).not.toContain('Скопировать ссылку');
  });

  it('renders in-app browser guidance when isTelegram is true', () => {
    const html = renderToStaticMarkup(
      <UnsupportedBrowserScreen
        isTelegram={true}
        url="https://mushketon.example.com"
      />
    );
    expect(html).toContain('Остался один маленький шаг');
    expect(html).toContain('Похоже, ссылка открылась во встроенном браузере.');
    expect(html).toContain('Давайте откроем приложение в обычном браузере — так оно сможет сохранять ваши тренировки и работать надёжно.');
    expect(html).toContain('Сначала откройте приложение');
    expect(html).toContain('Нажмите кнопку меню вверху экрана и выберите «Открыть в браузере».');
    expect(html).toContain('Если такой кнопки не видно, нажмите:');
    expect(html).toContain('Скопировать ссылку');
    expect(html).toContain('Потом откройте Safari или Chrome, вставьте ссылку в адресную строку и нажмите «Перейти».');
    expect(html).toContain('И сохраните приложение на телефоне');
    expect(html).toContain('Когда приложение откроется:');
    expect(html).toContain('на iPhone нажмите «Поделиться» → «На экран “Домой”»;');
    expect(html).toContain('на Android нажмите ⋮ → «Добавить на главный экран».');
    expect(html).toContain('Готово — в следующий раз приложение можно будет открыть прямо с рабочего стола, как обычную иконку.');
    // Must NOT mention Telegram
    expect(html).not.toContain('Telegram');
  });

  it('has main role with accessible label', () => {
    const html = renderToStaticMarkup(<UnsupportedBrowserScreen isTelegram={true} />);
    expect(html).toContain('role="main"');
    expect(html).toContain('aria-label="Предупреждение о неподдерживаемом браузере"');
  });
});

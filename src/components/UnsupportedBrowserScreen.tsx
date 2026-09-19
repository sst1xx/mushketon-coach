import React, { useState } from 'react';
import { copyTextToClipboard } from '../utils/clipboard';
import s from './UnsupportedBrowserScreen.module.css';

export interface UnsupportedBrowserScreenProps {
  /** If true, shows the in-app browser guidance. If false, shows generic unsupported screen. */
  isTelegram?: boolean;
  /** Explicit current URL to copy or display, defaults to window.location.href in browser */
  url?: string;
  /** Optional custom copy implementation (useful for tests or mocking) */
  onCopy?: (text: string) => Promise<boolean>;
}

export default function UnsupportedBrowserScreen({
  isTelegram = false,
  url,
  onCopy = copyTextToClipboard,
}: UnsupportedBrowserScreenProps) {
  const currentUrl = url ?? (typeof window !== 'undefined' ? window.location.href : '');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  const handleCopy = async () => {
    if (!currentUrl) return;
    try {
      const ok = await onCopy(currentUrl);
      if (ok) {
        setCopied(true);
        setCopyFailed(false);
        setTimeout(() => setCopied(false), 3000);
      } else {
        setCopyFailed(true);
      }
    } catch {
      setCopyFailed(true);
    }
  };

  if (isTelegram) {
    return (
      <main className={s.container} role="main" aria-label="Предупреждение о неподдерживаемом браузере">
        <div className={s.card}>
          <div className={s.iconWrapper} aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1 className={s.title}>Остался один маленький шаг</h1>

          <p className={s.description}>
            Похоже, ссылка открылась во встроенном браузере. Давайте откроем приложение в обычном браузере — так оно сможет сохранять ваши тренировки и работать надёжно.
          </p>

          <div className={s.stepsCard}>
            <div className={s.stepsTitle}>Сначала откройте приложение</div>
            <p className={s.stepText}>
              Нажмите кнопку меню вверху экрана и выберите «Открыть в браузере».
            </p>
            <p className={s.stepHint}>
              Если такой кнопки не видно, нажмите:
            </p>

            <div className={s.actions}>
              <button
                type="button"
                className={`${s.copyButton} ${copied ? s.copyButtonSuccess : ''}`}
                onClick={handleCopy}
                aria-live="polite"
              >
                {copied ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Ссылка скопирована!</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Скопировать ссылку</span>
                  </>
                )}
              </button>

              {copied && (
                <p className={s.statusMessage} role="status">
                  Ссылка скопирована! Теперь откройте Safari или Chrome и вставьте её в адресную строку.
                </p>
              )}

              {copyFailed && (
                <div className={s.urlFallback}>
                  <label htmlFor="telegram-fallback-url" className={s.urlLabel}>
                    Скопируйте адрес вручную:
                  </label>
                  <input
                    id="telegram-fallback-url"
                    type="text"
                    readOnly
                    value={currentUrl}
                    className={s.urlInput}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
              )}
            </div>

            <p className={s.stepFollowup}>
              Потом откройте Safari или Chrome, вставьте ссылку в адресную строку и нажмите «Перейти».
            </p>
          </div>

          <div className={s.stepsCard}>
            <div className={s.stepsTitle}>И сохраните приложение на телефоне</div>
            <p className={s.stepText}>
              Когда приложение откроется:
            </p>
            <ul className={s.stepsList}>
              <li>на iPhone нажмите «Поделиться» → «На экран “Домой”»;</li>
              <li>на Android нажмите ⋮ → «Добавить на главный экран».</li>
            </ul>
            <p className={s.stepHint} style={{ marginTop: '8px' }}>
              Готово — в следующий раз приложение можно будет открыть прямо с рабочего стола, как обычную иконку.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={s.container} role="main" aria-label="Предупреждение о неподдерживаемом браузере">
      <div className={s.card}>
        <div className={s.iconWrapper} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className={s.title}>Браузер не поддерживается</h1>
        <p className={s.description}>
          Для работы приложения необходимы IndexedDB и Service Worker.
        </p>
        <p className={s.description}>
          Используйте Safari на iOS 16.4+ или Chrome на Android 10+.
        </p>
      </div>
    </main>
  );
}

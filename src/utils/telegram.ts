export interface TelegramDetectionOptions {
  userAgent?: string;
  hasTelegramWebApp?: boolean;
}

/**
 * Detects whether the current environment is running inside Telegram's embedded WebView.
 * Checks User-Agent for known Telegram signatures (Telegram, TelegramBot, etc.)
 * and checks window.Telegram?.WebApp or window.TelegramWebviewProxy.
 */
export function isTelegramWebView(opts?: TelegramDetectionOptions): boolean {
  let ua = opts?.userAgent;
  if (ua === undefined && typeof navigator !== 'undefined') {
    ua = navigator.userAgent;
  }
  ua = (ua || '').toLowerCase();

  // Typical Telegram WebViews include "telegram" in UA on iOS/Android/Desktop
  if (ua.includes('telegram')) {
    return true;
  }

  if (opts?.hasTelegramWebApp !== undefined) {
    return opts.hasTelegramWebApp;
  }

  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      Telegram?: { WebApp?: unknown };
      TelegramWebviewProxy?: unknown;
    };
    if (Boolean(win.Telegram?.WebApp) || Boolean(win.TelegramWebviewProxy)) {
      return true;
    }
  }

  return false;
}

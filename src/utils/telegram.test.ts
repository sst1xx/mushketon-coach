import { describe, it, expect } from 'vitest';
import { isTelegramWebView } from './telegram';

describe('isTelegramWebView', () => {
  it('returns true when UA contains Telegram (case-insensitive)', () => {
    expect(isTelegramWebView({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) Mobile/15E148 Telegram' })).toBe(true);
    expect(isTelegramWebView({ userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 telegram-android' })).toBe(true);
    expect(isTelegramWebView({ userAgent: 'TelegramBot (like TwitterBot)' })).toBe(true);
  });

  it('returns false for standard mobile Safari and Chrome UAs', () => {
    const safari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    const chrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    expect(isTelegramWebView({ userAgent: safari })).toBe(false);
    expect(isTelegramWebView({ userAgent: chrome })).toBe(false);
  });

  it('returns true when hasTelegramWebApp option is true even without UA', () => {
    expect(isTelegramWebView({ userAgent: 'Mozilla/5.0 Safari', hasTelegramWebApp: true })).toBe(true);
  });

  it('returns false when hasTelegramWebApp is false and UA does not match', () => {
    expect(isTelegramWebView({ userAgent: 'Mozilla/5.0 Safari', hasTelegramWebApp: false })).toBe(false);
  });
});

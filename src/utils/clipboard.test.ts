import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
  const originalClipboard = (navigator as unknown as { clipboard?: unknown }).clipboard;
  const originalDocument = (globalThis as unknown as { document?: unknown }).document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    if (originalDocument === undefined) {
      delete (globalThis as unknown as { document?: unknown }).document;
    } else {
      (globalThis as unknown as { document: unknown }).document = originalDocument;
    }
  });

  it('uses navigator.clipboard.writeText when available and resolves true', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    });

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('https://example.com');
  });

  it('falls back to execCommand when navigator.clipboard throws', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
      configurable: true,
      writable: true,
    });

    const appendChildMock = vi.fn();
    const removeChildMock = vi.fn();
    const execCommandMock = vi.fn().mockReturnValue(true);

    const fakeTextarea = {
      value: '',
      style: {} as Record<string, string>,
      setAttribute: vi.fn(),
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: vi.fn().mockReturnValue(fakeTextarea),
      body: {
        appendChild: appendChildMock,
        removeChild: removeChildMock,
      },
      execCommand: execCommandMock,
    };

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(true);
    expect(fakeTextarea.value).toBe('https://example.com');
    expect(appendChildMock).toHaveBeenCalledWith(fakeTextarea);
    expect(execCommandMock).toHaveBeenCalledWith('copy');
    expect(removeChildMock).toHaveBeenCalledWith(fakeTextarea);
  });

  it('returns false if both clipboard and execCommand fail', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error('Fail')),
      },
      configurable: true,
      writable: true,
    });

    (globalThis as unknown as { document: unknown }).document = {
      createElement: vi.fn().mockImplementation(() => {
        throw new Error('createElement disabled');
      }),
    };

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(false);
  });

  it('returns false when neither clipboard nor document are available', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    delete (globalThis as unknown as { document?: unknown }).document;

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(false);
  });
});

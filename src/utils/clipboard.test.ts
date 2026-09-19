import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyTextToClipboard } from './clipboard';

describe('copyTextToClipboard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses navigator.clipboard.writeText when available and resolves true', async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      clipboard: { writeText: writeTextMock },
    });

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledWith('https://example.com');
  });

  it('falls back to execCommand when navigator.clipboard throws', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Permission denied')),
      },
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

    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(fakeTextarea),
      body: {
        appendChild: appendChildMock,
        removeChild: removeChildMock,
      },
      execCommand: execCommandMock,
    });

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(true);
    expect(fakeTextarea.value).toBe('https://example.com');
    expect(appendChildMock).toHaveBeenCalledWith(fakeTextarea);
    expect(execCommandMock).toHaveBeenCalledWith('copy');
    expect(removeChildMock).toHaveBeenCalledWith(fakeTextarea);
  });

  it('returns false if both clipboard and execCommand fail', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('Fail')),
      },
    });

    vi.stubGlobal('document', {
      createElement: vi.fn().mockImplementation(() => {
        throw new Error('createElement disabled');
      }),
    });

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(false);
  });

  it('returns false when neither clipboard nor document are available', async () => {
    vi.stubGlobal('navigator', undefined);
    vi.stubGlobal('document', undefined);

    const success = await copyTextToClipboard('https://example.com');
    expect(success).toBe(false);
  });
});

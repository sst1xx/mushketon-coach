import { describe, it, expect, vi, afterEach } from 'vitest';
import { getAuthUrl, fetchFreeModels, callChat, exchangeCode } from './openrouter';
import { DEFAULT_MODEL } from './models';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getAuthUrl', () => {
  it('includes callback_url and PKCE code_challenge params', () => {
    const url = getAuthUrl('https://example.app/', 'CHALLENGE123');
    expect(url).toContain('https://openrouter.ai/auth?');
    expect(url).toContain('callback_url=https%3A%2F%2Fexample.app%2F');
    expect(url).toContain('code_challenge=CHALLENGE123');
    expect(url).toContain('code_challenge_method=S256');
  });
});

describe('exchangeCode', () => {
  it('posts code, code_verifier and callback_url, and returns the key', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ key: 'sk-or-v1-abc', user_id: 'u1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const key = await exchangeCode('CODE123', 'VERIFIER456', 'https://example.app/');
    expect(key).toBe('sk-or-v1-abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/auth/keys');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.code).toBe('CODE123');
    expect(body.code_verifier).toBe('VERIFIER456');
    expect(body.callback_url).toBe('https://example.app/');
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }));
    await expect(exchangeCode('c', 'v', 'https://example.app/')).rejects.toThrow();
  });

  it('throws when the response has no key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(exchangeCode('c', 'v', 'https://example.app/')).rejects.toThrow();
  });
});

describe('fetchFreeModels', () => {
  it('keeps only fully free, text->text models; openrouter/free is always first', async () => {
    const data = {
      data: [
        { id: 'paid/model', name: 'Paid Model', pricing: { prompt: '0.001', completion: '0' }, architecture: { modality: 'text->text' } },
        { id: 'z/other-free', name: 'Z Other Free', pricing: { prompt: '0', completion: '0' }, architecture: { modality: 'text->text' } },
        { id: 'audio/free-audio', name: 'Free Audio', pricing: { prompt: '0', completion: '0' }, architecture: { modality: 'audio->audio' } },
        { id: 'a/another-free', name: 'A Another Free', pricing: { prompt: '0', completion: '0' }, architecture: { modality: 'text->text' } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => data,
    }));

    const models = await fetchFreeModels('sk-test');
    // openrouter/free prepended; paid and audio filtered out; rest sorted alphabetically
    expect(models.map(m => m.id)).toEqual(['openrouter/free', 'a/another-free', 'z/other-free']);
  });

  it('prepends openrouter/free via unshift even when absent from API response', async () => {
    // Validates the unshift guard: if the API returns no openrouter/free entry,
    // fetchFreeModels still inserts it first.
    const data = {
      data: [
        { id: 'z/other-free', name: 'Z Other Free', pricing: { prompt: '0', completion: '0' }, architecture: { modality: 'text->text' } },
        { id: 'a/another-free', name: 'A Another Free', pricing: { prompt: '0', completion: '0' }, architecture: { modality: 'text->text' } },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => data,
    }));
    const models = await fetchFreeModels('sk-test');
    expect(models[0].id).toBe('openrouter/free');
    expect(models.map(m => m.id)).toEqual(['openrouter/free', 'a/another-free', 'z/other-free']);
  });

  it('throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }));
    await expect(fetchFreeModels('bad-key')).rejects.toThrow();
  });
});

describe('callChat', () => {
  it('sends model and both messages in the request body', async () => {
    const responseBody = JSON.stringify({ choices: [{ message: { content: 'Ответ AI' } }] });
    const encoded = new TextEncoder().encode(responseBody);
    let done = false;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            if (!done) { done = true; return { done: false, value: encoded }; }
            return { done: true, value: undefined };
          },
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await callChat('sk-test', 'model-x', 'system prompt', 'user prompt');
    expect(result).toBe('Ответ AI');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.model).toBe('model-x');
    expect(body.messages).toEqual([
      { role: 'system', content: 'system prompt' },
      { role: 'user', content: 'user prompt' },
    ]);
  });

  it('throws with a status code when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 402, json: async () => ({}) }));
    await expect(callChat('sk-test', 'm', 's', 'u')).rejects.toMatchObject({ status: 402 });
  });

  it('throws when choices is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }));
    await expect(callChat('sk-test', 'm', 's', 'u')).rejects.toThrow();
  });

  it('calls onProgress with sentBytes before fetch and growing receivedBytes', async () => {
    const chunk1 = new TextEncoder().encode('{"choices":[{"message":{"content":"ok"}}');
    const chunk2 = new TextEncoder().encode(']}');
    let call = 0;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            call++;
            if (call === 1) return { done: false, value: chunk1 };
            if (call === 2) return { done: false, value: chunk2 };
            return { done: true, value: undefined };
          },
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    const progressCalls: { sentBytes: number; receivedBytes: number }[] = [];
    await callChat('sk', 'model', 'sys', 'usr', undefined, (p) => progressCalls.push({ ...p }));

    // первый вызов — до fetch, receivedBytes = 0
    expect(progressCalls[0].receivedBytes).toBe(0);
    expect(progressCalls[0].sentBytes).toBeGreaterThan(0);
    // после первого чанка
    expect(progressCalls[1].receivedBytes).toBe(chunk1.length);
    // после второго чанка — нарастающий
    expect(progressCalls[2].receivedBytes).toBe(chunk1.length + chunk2.length);
  });

  it('rejects with AbortError when signal is aborted during read', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => {
            controller.abort();
            const err = new DOMException('Aborted', 'AbortError');
            throw err;
          },
        }),
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      callChat('sk', 'model', 'sys', 'usr', controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

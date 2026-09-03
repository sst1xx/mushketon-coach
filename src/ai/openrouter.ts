/**
 * OpenRouter OAuth PKCE + chat completion client. Pure fetch wrappers —
 * no React, no IndexedDB. Callers pass in whatever origin/verifier/key is
 * needed so these functions stay testable without mocking `window`.
 * See docs/plans/PLAN-AI-ANALYSIS.md §4 and §6.
 */
import { DEFAULT_MODEL, type AiModel } from './models';

const OPENROUTER_BASE = 'https://openrouter.ai';

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Generates a PKCE verifier/challenge pair via Web Crypto API (S256).
 */
export async function generatePkce(): Promise<{ verifier: string; challenge: string }> {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const verifier = base64UrlEncode(verifierBytes);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(new Uint8Array(digest));
  return { verifier, challenge };
}

/**
 * Builds the OpenRouter OAuth authorization URL for the PKCE flow.
 */
export function getAuthUrl(callbackUrl: string, challenge: string): string {
  const params = new URLSearchParams({
    callback_url: callbackUrl,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${OPENROUTER_BASE}/auth?${params.toString()}`;
}

/**
 * Exchanges an OAuth `code` for a permanent OpenRouter API key.
 * Returns the API key string (`sk-or-v1-…`); there is no expiry to track.
 */
export async function exchangeCode(code: string, verifier: string, callbackUrl: string): Promise<string> {
  const res = await fetch(`${OPENROUTER_BASE}/api/v1/auth/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256', callback_url: callbackUrl }),
  });
  if (!res.ok) throw new Error(`OpenRouter auth exchange failed: ${res.status}`);
  const data = await res.json();
  if (!data.key) throw new Error('OpenRouter auth exchange returned no key');
  return data.key as string;
}

/**
 * Fetches the current list of fully free, text-to-text chat models from
 * OpenRouter. Free = zero prompt and completion pricing; text->text
 * excludes non-chat modalities (e.g. audio/image generators like Lyria).
 * DEFAULT_MODEL is sorted first when present.
 */
export async function fetchFreeModels(apiKey: string): Promise<AiModel[]> {
  const res = await fetch(`${OPENROUTER_BASE}/api/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter models list failed: ${res.status}`);
  const data = await res.json();
  const models: AiModel[] = (data.data ?? [])
    .filter((m: any) =>
      m?.pricing?.prompt === '0' &&
      m?.pricing?.completion === '0' &&
      m?.architecture?.modality === 'text->text',
    )
    .map((m: any) => ({ id: m.id, name: m.name ?? m.id }));

  models.sort((a, b) => {
    if (a.id === DEFAULT_MODEL) return -1;
    if (b.id === DEFAULT_MODEL) return 1;
    return a.name.localeCompare(b.name);
  });
  // Ensure openrouter/free is always the first option.
  const freeRouterIdx = models.findIndex(m => m.id === 'openrouter/free');
  if (freeRouterIdx > 0) {
    models.splice(freeRouterIdx, 1);
  }
  if (freeRouterIdx !== 0) {
    models.unshift({ id: 'openrouter/free', name: 'Free Router (случайная бесплатная)' });
  }
  return models;
}

/**
 * Sends a chat completion request and returns the assistant's text.
 * Throws on non-2xx responses or an empty `choices` array so callers can
 * surface a clear error message (see PLAN-AI-ANALYSIS.md §9).
 */
export interface ChatProgress {
  sentBytes: number;
  receivedBytes: number;
}

export async function callChat(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  signal?: AbortSignal,
  onProgress?: (p: ChatProgress) => void,
): Promise<string> {
  const bodyStr = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  const sentBytes = new TextEncoder().encode(bodyStr).length;
  onProgress?.({ sentBytes, receivedBytes: 0 });

  const res = await fetch(`${OPENROUTER_BASE}/api/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: bodyStr,
    signal,
  });
  if (!res.ok) {
    const err: any = new Error(`OpenRouter chat request failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }

  // Read response body as a stream to count received bytes in real time.
  const reader = res.body?.getReader();
  if (!reader) throw new Error('OpenRouter returned an empty response');
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    receivedBytes += value.length;
    onProgress?.({ sentBytes, receivedBytes });
  }
  const full = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) { full.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(full));

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenRouter returned an empty response');
  return content as string;
}

/**
 * OpenRouter model selection for AI analysis. Kept pure (no React, no I/O)
 * so it can be tested without a DOM/network environment — see openrouter.ts
 * for the fetch that populates a list of AiModel using this default.
 */
export const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';

export interface AiModel {
  id: string;
  name: string;
}

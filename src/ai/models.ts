/**
 * OpenRouter model selection for AI analysis. Kept pure (no React, no I/O)
 * so it can be tested without a DOM/network environment — see openrouter.ts
 * for the fetch that populates a list of AiModel using this default.
 */
export const DEFAULT_MODEL = 'openrouter/free';

export interface AiModel {
  id: string;
  name: string;
}

/**
 * Selects the model to activate given a saved preference and the available list.
 * Priority: savedModel (if in list) → DEFAULT_MODEL (if in list) → first in list → null.
 */
export function selectModel(
  savedModel: string | null | undefined,
  modelIds: string[],
): string | null {
  if (typeof savedModel === 'string' && savedModel && modelIds.includes(savedModel)) return savedModel;
  if (modelIds.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  if (modelIds.length > 0) return modelIds[0];
  return null;
}

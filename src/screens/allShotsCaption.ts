import type { AllShotsEntry } from '../domain/allShotsRepo';

/**
 * Pure formatter for the comment line shown under the selected/last shot on
 * AllShotsScreen. Kept separate from the component so the empty/whitespace/
 * long-text cases are covered by fast unit tests without rendering.
 *
 * Returns '' (empty string) when there is no entry or the entry has no
 * comment — the caller always renders the returned string in a
 * fixed-height slot so the layout never jumps between states.
 */
export function formatCommentLine(entry: AllShotsEntry | null): string {
  if (!entry || !entry.hasComment) return '';
  const trimmed = (entry.commentText ?? '').trim();
  return trimmed ? `💬 ${trimmed}` : '💬 —';
}

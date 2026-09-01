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

const shotLabelDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

/**
 * Pure formatter for the score line shown above the target on
 * AllShotsScreen. When more than one training is represented in the
 * currently displayed entries, the training date is appended so the coach
 * can tell which training a given shot belongs to.
 */
export function formatShotLabel(entry: AllShotsEntry | null, multiTraining: boolean): string {
  if (!entry) return '–';
  const scoreLabel = entry.shot.score > 0 ? (entry.shot.score / 10).toFixed(1) : '0.0';
  if (!multiTraining) return `№${entry.globalNumber} • ${scoreLabel}`;
  const dateLabel = shotLabelDateFormatter.format(new Date(entry.shot.createdAt));
  return `№${entry.globalNumber} (${dateLabel}) • ${scoreLabel}`;
}

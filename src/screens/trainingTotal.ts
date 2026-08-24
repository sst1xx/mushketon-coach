import type { ShotRecord } from '../db/schema';

/**
 * Pure formatter for the training total shown in the trainings list
 * (TrainingsScreen). Sums the `score` (tenths) of committed shots only —
 * drafts don't count. Returns '–' when the training has no committed shots
 * yet, otherwise the whole-point total with the ISSF decimal total in
 * parentheses (e.g. `82 (82.4)`).
 */
export function formatTrainingTotal(shots: ShotRecord[]): string {
  const committed = shots.filter(s => s.status === 'committed');
  if (committed.length === 0) return '–';
  const totalTenths = committed.reduce((sum, s) => sum + s.score, 0);
  const decimal = (totalTenths / 10).toFixed(1);
  const whole = committed.reduce((sum, s) => sum + Math.floor(s.score / 10), 0);
  return `${whole} (${decimal})`;
}

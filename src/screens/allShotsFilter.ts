import type { AllShotsEntry } from '../domain/allShotsRepo';

/**
 * Pure helper for AllShotsScreen: filters entries to the selected set of
 * trainings and renumbers globalNumber to be dense 1..N within the filtered
 * set. Kept separate from the component so the filtering/renumbering logic is
 * covered by fast unit tests without rendering.
 *
 * Three states:
 * - null            → no filter, show all entries ([Все] chip active)
 * - empty Set       → nothing selected, show no entries
 * - non-empty Set   → filter to matching training ids
 */
export function filterAllShotsEntries(
  entries: AllShotsEntry[],
  trainingIds: ReadonlySet<string> | null,
): AllShotsEntry[] {
  if (trainingIds === null) return entries;
  if (trainingIds.size === 0) return [];
  return entries
    .filter((e) => trainingIds.has(e.trainingId))
    .map((e, index) => ({ ...e, globalNumber: index + 1 }));
}

/**
 * Toggles the "show all" state used by the [Все] chip:
 * - null (all shown)  → new Set() (nothing selected)
 * - Set  (any)        → null (show all)
 */
export function toggleAllTrainingsFilter(
  current: ReadonlySet<string> | null,
): Set<string> | null {
  return current === null ? new Set() : null;
}

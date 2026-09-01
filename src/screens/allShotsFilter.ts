import type { AllShotsEntry } from '../domain/allShotsRepo';

/**
 * Pure helper for AllShotsScreen: filters entries to the selected set of
 * trainings (or keeps them all when trainingIds is null or empty) and
 * renumbers globalNumber to be dense 1..N within the filtered set. Kept
 * separate from the component so the filtering/renumbering logic is
 * covered by fast unit tests without rendering.
 *
 * An empty or null trainingIds means "no filter" — the caller uses this to
 * represent the [Все] chip state without needing a separate sentinel value.
 */
export function filterAllShotsEntries(
  entries: AllShotsEntry[],
  trainingIds: ReadonlySet<string> | null,
): AllShotsEntry[] {
  if (trainingIds === null || trainingIds.size === 0) return entries;
  return entries
    .filter((e) => trainingIds.has(e.trainingId))
    .map((e, index) => ({ ...e, globalNumber: index + 1 }));
}

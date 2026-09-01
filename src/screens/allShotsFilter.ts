import type { AllShotsEntry } from '../domain/allShotsRepo';

/**
 * Pure helper for AllShotsScreen: filters entries to a single training (or
 * keeps them all when trainingId is null) and renumbers globalNumber to be
 * dense 1..N within the filtered set. Kept separate from the component so
 * the filtering/renumbering logic is covered by fast unit tests without
 * rendering.
 */
export function filterAllShotsEntries(
  entries: AllShotsEntry[],
  trainingId: string | null,
): AllShotsEntry[] {
  if (trainingId === null) return entries;
  return entries
    .filter((e) => e.trainingId === trainingId)
    .map((e, index) => ({ ...e, globalNumber: index + 1 }));
}

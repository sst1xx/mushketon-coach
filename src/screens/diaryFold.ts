/**
 * Pure fold-state logic for the "Дневник" screen (RemarksScreen), see
 * docs/plans/PLAN-DIARY-FOLD.md §5/§5.1. No React, no I/O — mirrors the
 * purity convention of scoring.ts/transform.ts for UI helpers where possible.
 */

export function seriesFoldKey(trainingId: string, seriesIndex: number): string {
  return `${trainingId}:${seriesIndex}`;
}

export function defaultTrainingFolded(entry: {
  completedAt: string | null;
  hasGeneralComment: boolean;
  hasAnySeriesOrShotComment: boolean;
}): boolean {
  if (entry.completedAt === null) return false;
  if (entry.hasGeneralComment) return false;
  if (entry.hasAnySeriesOrShotComment) return false;
  return true;
}

export function defaultSeriesFolded(row: {
  hasSeriesComment: boolean;
  hasShotComments: boolean;
}): boolean {
  if (row.hasSeriesComment) return false;
  if (row.hasShotComments) return false;
  return true;
}

export function isTrainingFolded(
  foldedTrainings: Record<string, boolean> | undefined,
  trainingId: string,
  defaultFolded: boolean,
): boolean {
  const explicit = foldedTrainings?.[trainingId];
  return explicit !== undefined ? explicit : defaultFolded;
}

export function isSeriesFolded(
  foldedSeries: Record<string, boolean> | undefined,
  trainingId: string,
  seriesIndex: number,
  defaultFolded: boolean,
): boolean {
  const explicit = foldedSeries?.[seriesFoldKey(trainingId, seriesIndex)];
  return explicit !== undefined ? explicit : defaultFolded;
}

interface VisibleEntry {
  trainingId: string;
  seriesIndexes: readonly number[];
}

function buildFoldState(
  entries: readonly VisibleEntry[],
  folded: boolean,
): { foldedTrainings: Record<string, boolean>; foldedSeries: Record<string, boolean> } {
  const foldedTrainings: Record<string, boolean> = {};
  const foldedSeries: Record<string, boolean> = {};
  for (const entry of entries) {
    foldedTrainings[entry.trainingId] = folded;
    for (const seriesIndex of entry.seriesIndexes) {
      foldedSeries[seriesFoldKey(entry.trainingId, seriesIndex)] = folded;
    }
  }
  return { foldedTrainings, foldedSeries };
}

export function collapseAllFoldState(
  entries: readonly VisibleEntry[],
): { foldedTrainings: Record<string, boolean>; foldedSeries: Record<string, boolean> } {
  return buildFoldState(entries, true);
}

export function expandAllFoldState(
  entries: readonly VisibleEntry[],
): { foldedTrainings: Record<string, boolean>; foldedSeries: Record<string, boolean> } {
  return buildFoldState(entries, false);
}

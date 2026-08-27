import type { ShotRecord, TrainingRecord } from '../db/schema';

/**
 * Training mode is derived from the existing `targetShotCount`, never stored
 * as a separate field (see PLAN-TRAINING-MODES.md): `10` is a single series,
 * `60` is a ПП-3 exercise (6 series of 10), anything else (including
 * null/undefined) is a legacy unlimited record.
 */
export type TrainingMode = 'series' | 'pp3' | 'legacy';

export const SERIES_SHOT_COUNT = 10;
export const PP3_SERIES_COUNT = 6;
export const PP3_SHOT_COUNT = SERIES_SHOT_COUNT * PP3_SERIES_COUNT;

export function getTrainingMode(training: Pick<TrainingRecord, 'targetShotCount'>): TrainingMode {
  if (training.targetShotCount === SERIES_SHOT_COUNT) return 'series';
  if (training.targetShotCount === PP3_SHOT_COUNT) return 'pp3';
  return 'legacy';
}

export interface Pp3SeriesBlock {
  /** 1-based series index within the exercise (1..6). */
  index: number;
  /** Committed shots belonging to this block (up to 10, in shotNumber order). */
  shots: ShotRecord[];
  /** Number of committed shots in this block (0..10). */
  committedCount: number;
  /** True for the block matching `currentSeriesNumber` while it is not yet full. */
  isCurrent: boolean;
}

/**
 * Splits committed shots of a ПП-3 exercise into 6 fixed blocks of 10 by
 * `shotNumber` order. Draft shots are excluded — pass only committed shots.
 * `currentSeriesNumber` (see `getPp3CurrentSeriesNumber`) picks which
 * not-yet-full block is flagged `isCurrent`.
 */
export function getPp3SeriesBlocks(committedShots: ShotRecord[], currentSeriesNumber: number): Pp3SeriesBlock[] {
  const sorted = [...committedShots].sort((a, b) => a.shotNumber - b.shotNumber);
  const blocks: Pp3SeriesBlock[] = [];
  for (let i = 0; i < PP3_SERIES_COUNT; i++) {
    const shots = sorted.slice(i * SERIES_SHOT_COUNT, (i + 1) * SERIES_SHOT_COUNT);
    const index = i + 1;
    const committedCount = shots.length;
    blocks.push({ index, shots, committedCount, isCurrent: index === currentSeriesNumber && committedCount < SERIES_SHOT_COUNT });
  }
  return blocks;
}

/**
 * 1-based series number (1..6) that should be shown on the target/labels,
 * given the highest `shotNumber` present among all shots (committed or
 * draft) of the ПП-3 exercise so far. The target keeps showing series N in
 * full — including its 10th shot, editable — until the 11th shot (draft or
 * committed) actually appears; only then does it switch to a fresh screen
 * with the new block (see PLAN-TRAINING-MODES.md and its follow-up UX fix).
 * `0` (no shots yet) resolves to series 1. Clamped to 6 once complete.
 */
export function getPp3CurrentSeriesNumber(maxShotNumber: number): number {
  return Math.min(PP3_SERIES_COUNT, Math.max(1, Math.ceil(maxShotNumber / SERIES_SHOT_COUNT)));
}

/**
 * Number of committed shots within the current (possibly unfinished) series
 * of a ПП-3 exercise, i.e. progress towards the next `N/10` boundary.
 */
export function getPp3CurrentSeriesProgress(committedCount: number): number {
  if (committedCount >= PP3_SHOT_COUNT) return SERIES_SHOT_COUNT;
  return committedCount % SERIES_SHOT_COUNT;
}

/**
 * shotNumber range `[start, end]` (inclusive, 1-based) of the ПП-3 series
 * identified by `seriesNumber` (1..6). Used to pick which shots belong on
 * the currently visible target so each finished ten switches to a fresh
 * screen instead of accumulating all 60 shots on one target.
 */
export function getPp3SeriesShotNumberRange(seriesNumber: number): { start: number; end: number } {
  return {
    start: (seriesNumber - 1) * SERIES_SHOT_COUNT + 1,
    end: seriesNumber * SERIES_SHOT_COUNT,
  };
}

/**
 * Shots (committed or draft) that belong on the target canvas while
 * viewing `viewedSeriesNumber` of a ПП-3 exercise — i.e. only the shots
 * whose `shotNumber` falls in that series' 10-shot window.
 */
export function getPp3ViewedShots(shots: ShotRecord[], viewedSeriesNumber: number): ShotRecord[] {
  const { start, end } = getPp3SeriesShotNumberRange(viewedSeriesNumber);
  return shots.filter((s) => s.shotNumber >= start && s.shotNumber <= end);
}

/**
 * Shots (committed or draft) to render on the target canvas / mobile shots
 * list for a ПП-3 exercise. Normally this is just the currently viewed
 * series' 10-shot window (see `getPp3ViewedShots`). But once the whole
 * exercise is finished (`isCompleted`) and the coach has not explicitly
 * picked a series to review (`selectedSeriesView === null`), tapping
 * «Просмотр» should show all 60 shots of the exercise rather than only the
 * last 10-shot block — the coach can still narrow to one series via its chip.
 */
export function getPp3CanvasShots(
  shots: ShotRecord[],
  viewedSeriesNumber: number,
  isCompleted: boolean,
  selectedSeriesView: number | null,
): ShotRecord[] {
  if (isCompleted && selectedSeriesView === null) return shots;
  return getPp3ViewedShots(shots, viewedSeriesNumber);
}

/**
 * ПП-3 shows only the current series on the target screen by default (see
 * PLAN-TRAINING-MODES.md §2), but a coach must still be able to edit shots
 * of an already-completed series (locked rule: last shot and older shots
 * stay editable). `selectedView` is the series explicitly picked via the
 * series chips, or `null` to fall back to the live current series.
 */
export function resolvePp3ViewedSeriesNumber(selectedView: number | null, currentSeries: number): number {
  return selectedView ?? currentSeries;
}

/**
 * True when the coach is viewing a completed series other than the one
 * currently being shot. New shots must never be created while viewing a
 * past series — they always belong to the current series.
 */
export function isViewingPastPp3Series(selectedView: number | null, currentSeries: number): boolean {
  return selectedView !== null && selectedView !== currentSeries;
}

/**
 * Short mode+progress label for the trainings list (§4 of the plan). Returns
 * `null` for legacy unlimited records so the list keeps its previous,
 * backward-compatible display for them.
 */
export function getTrainingListLabel(
  training: Pick<TrainingRecord, 'targetShotCount'>,
  committedCount: number,
): string | null {
  const mode = getTrainingMode(training);
  if (mode === 'series') return `Серия · ${committedCount}/${SERIES_SHOT_COUNT}`;
  if (mode === 'pp3') {
    const completedSeries = Math.min(PP3_SERIES_COUNT, Math.floor(committedCount / SERIES_SHOT_COUNT));
    return `ПП-3 · ${completedSeries}/${PP3_SERIES_COUNT} серий · ${committedCount}/${PP3_SHOT_COUNT} выстрелов`;
  }
  return null;
}

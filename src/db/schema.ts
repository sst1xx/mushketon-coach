/**
 * IndexedDB schema types for musketoon-coach.
 * All coordinates stored as integer hundredths of mm (xh/yh).
 * Score stored as integer tenths (109..10, 0).
 */

export interface AthleteRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingRecord {
  id: string;
  athleteId: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  nextShotNumber: number;
  targetShotCount?: number | null;
}

export type ShotStatus = 'draft' | 'committed';

export interface ShotRecord {
  id: string;
  trainingId: string;
  shotNumber: number;
  x: number;
  y: number;
  score: number;
  status: ShotStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommentRecord {
  id: string;
  athleteId: string;
  trainingId: string;
  shotId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * General (non-shot) remark for a whole self-started training element
 * (a "series" — targetShotCount=10 — or a ПП-3 "exercise" —
 * targetShotCount=60). One per training, keyed by trainingId.
 */
export interface GeneralCommentRecord {
  trainingId: string;
  athleteId: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * General (non-shot) remark for a single ПП-3 series (targetShotCount=60,
 * seriesNumber 1..6), independent from the exercise-wide GeneralCommentRecord.
 * One per (trainingId, seriesNumber) pair — the primary key `id` is
 * `${trainingId}:${seriesNumber}` (see seriesCommentRepo.ts).
 */
export interface SeriesCommentRecord {
  id: string;
  athleteId: string;
  trainingId: string;
  seriesNumber: number;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export type SettingsKey = 'SCORING_VERSION' | 'dataEpoch' | 'storagePersisted' | 'lastBackupAt' | 'targetZoomMode';

export interface SettingsRecord {
  key: SettingsKey;
  value: number | boolean | string | null;
}

export const DB_NAME = 'musketoon-coach';
export const DB_VERSION = 4;

export const STORES = {
  ATHLETES: 'athletes',
  TRAININGS: 'trainings',
  SHOTS: 'shots',
  SETTINGS: 'settings',
  COMMENTS: 'comments',
  GENERAL_COMMENTS: 'generalComments',
  SERIES_COMMENTS: 'seriesComments',
} as const;

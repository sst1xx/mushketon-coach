/**
 * IndexedDB schema types for mushketon-coach.
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

export type SettingsKey = 'SCORING_VERSION' | 'dataEpoch' | 'storagePersisted' | 'lastBackupAt';

export interface SettingsRecord {
  key: SettingsKey;
  value: number | boolean | string | null;
}

export const DB_NAME = 'mushketon-coach';
export const DB_VERSION = 1;

export const STORES = {
  ATHLETES: 'athletes',
  TRAININGS: 'trainings',
  SHOTS: 'shots',
  SETTINGS: 'settings',
} as const;

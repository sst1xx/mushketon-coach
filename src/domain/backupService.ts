import { openDB } from '../db/open';
import {
  AthleteRecord,
   TrainingRecord,
   ShotRecord,
   SettingsRecord,
   STORES,
  } from '../db/schema';
import { score as recomputeScore, SCORING_VERSION } from '../scoring';
import { getSetting, setSetting } from '../db/settings';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BackupSettings {
  SCORING_VERSION: number;
  dataEpoch: number;
  storagePersisted: boolean | null;
  lastBackupAt: string | null;
}

export interface BackupFile {
  version: 1;
  exportedAt: string;
  athletes: AthleteRecord[];
  trainings: TrainingRecord[];
  shots: ShotRecord[];
  settings: BackupSettings;
}

// ─── exportBackup (§19.1 e) ──────────────────────────────────────────────────

export async function exportBackup(): Promise<BackupFile> {
  const db = await openDB();
  let athletes: AthleteRecord[] = [];
  let trainings: TrainingRecord[] = [];
  let shots: ShotRecord[] = [];
  let settings!: BackupSettings;

  // One readonly transaction over all 4 stores
  await new Promise<void>((resolve, reject) => {
     const tx = db.transaction([
        STORES.ATHLETES,
        STORES.TRAININGS,
        STORES.SHOTS,
        STORES.SETTINGS,
       ], 'readonly');
   tx.oncomplete = () => resolve();
   tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);

      const aReq = tx.objectStore(STORES.ATHLETES).getAll();
      aReq.onsuccess = () => { athletes = aReq.result as AthleteRecord[]; };
     aReq.onerror = () => reject(aReq.error);

      const tReq = tx.objectStore(STORES.TRAININGS).getAll();
      tReq.onsuccess = () => { trainings = tReq.result as TrainingRecord[]; };
     tReq.onerror = () => reject(tReq.error);

      const sReq = tx.objectStore(STORES.SHOTS).getAll();
      sReq.onsuccess = () => { shots = sReq.result as ShotRecord[]; };
     sReq.onerror = () => reject(sReq.error);

      const stReq = tx.objectStore(STORES.SETTINGS).getAll();
      stReq.onsuccess = () => {
          const recs = stReq.result as SettingsRecord[];
         const map: Record<string, any> = {};
        for (const r of recs) map[r.key] = r.value;
        settings = {
          SCORING_VERSION: map.SCORING_VERSION ?? SCORING_VERSION,
          dataEpoch: map.dataEpoch ?? 1,
          storagePersisted: map.storagePersisted ?? null,
          lastBackupAt: map.lastBackupAt ?? null,
          };
        };
     stReq.onerror = () => reject(stReq.error);
     });

  // Only committed shots in the export
  const committed = shots.filter((s) => s.status === 'committed');
  const data: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    athletes,
    trainings,
    shots: committed,
    settings,
      };

  // Validate before returning
  try {
    validateBackup(data);
    } catch (e) {
      throw new Error(
        'Не удалось создать резервную копию: обнаружено несогласованное состояние данных',
      );
      }
  return data;
}

// ─── validateBackup ─────────────────────────────────────────────────────────

const ALLOWED_SETTINGS_KEYS = new Set(['SCORING_VERSION', 'dataEpoch', 'storagePersisted', 'lastBackupAt']);

function isISO(str: string): boolean {
 return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/.test(str);
}

export function validateBackup(data: unknown): asserts data is BackupFile {
  if (typeof data !== 'object' || data === null) {
    throw new Error('Invalid backup: not an object');
   }

  const file = data as any;

  // 1. version
  if (file.version !== 1) {
    throw new Error('Файл создан более новой версией приложения');
   }

  // 3. required fields present + correct types
  if (typeof file.exportedAt !== 'string' || !isISO(file.exportedAt))
    throw new Error('Invalid exportedAt');
  if (!Array.isArray(file.athletes))
    throw new Error('athletes must be an array');
  if (!Array.isArray(file.trainings))
    throw new Error('trainings must be an array');
  if (!Array.isArray(file.shots))
    throw new Error('shots must be an array');
  if (typeof file.settings !== 'object' || file.settings === null)
    throw new Error('settings must be an object');

  // 11. name: non-empty string <= 100 chars
  for (const a of file.athletes as AthleteRecord[]) {
     if (typeof a.name !== 'string' || a.name.length === 0 || a.name.length > 100)
      throw new Error(`Invalid athlete name: ${a.name}`);
      if (!isISO(a.createdAt) || !isISO(a.updatedAt))
        throw new Error(`Invalid athlete time: ${a.id}`);
      if (new Date(a.createdAt).getTime() > new Date(a.updatedAt).getTime())
        throw new Error(`createdAt > updatedAt: ${a.id}`);
       }

  // 4–10 for trainings
  for (const t of file.trainings as TrainingRecord[]) {
    if (typeof t.id !== 'string' || t.id.length === 0)
      throw new Error('Invalid training id');
    if (typeof t.athleteId !== 'string')
      throw new Error('Invalid training.athleteId');
    if (!isISO(t.startedAt) || !isISO(t.updatedAt))
      throw new Error(`Invalid training time: ${t.id}`);
    if (t.completedAt !== null && typeof t.completedAt !== 'string')
      throw new Error(`Invalid training.completedAt: ${t.id}`);
    if (t.completedAt !== null && !isISO(t.completedAt))
      throw new Error(`Invalid training.completedAt: ${t.id}`);
    if (new Date(t.startedAt).getTime() > new Date(t.updatedAt).getTime())
      throw new Error(`startedAt > updatedAt: ${t.id}`);
    if (t.completedAt !== null &&
        new Date(t.startedAt).getTime() > new Date(t.completedAt).getTime())
      throw new Error(`startedAt > completedAt: ${t.id}`);
    if (typeof t.nextShotNumber !== 'number' || t.nextShotNumber < 1)
      throw new Error(`Invalid nextShotNumber: ${t.id}`);
    }

  // 6–8, 12 for shots
  for (const s of file.shots as ShotRecord[]) {
    if (typeof s.id !== 'string' || s.id.length === 0)
      throw new Error('Invalid shot id');
    if (typeof s.trainingId !== 'string')
      throw new Error('Invalid shot.trainingId');
    if (typeof s.shotNumber !== 'number' || s.shotNumber < 1)
      throw new Error(`Invalid shotNumber: ${s.id}`);
    if (typeof s.x !== 'number' || typeof s.y !== 'number')
      throw new Error(`Invalid coords: ${s.id}`);
    // 6. x,y integers in range, within radius
    const xa = Math.abs(s.x), ya = Math.abs(s.y);
    if (xa > 8000 || ya > 8000)
      throw new Error(`Coords out of range: ${s.id}`);
    if (s.x * s.x + s.y * s.y > 8000 * 8000)
      throw new Error(`Point outside target: ${s.id}`);
    // 10. time fields
    if (!isISO(s.createdAt) || !isISO(s.updatedAt))
      throw new Error(`Invalid shot time: ${s.id}`);
    if (new Date(s.createdAt).getTime() > new Date(s.updatedAt).getTime())
      throw new Error(`createdAt > updatedAt: ${s.id}`);
    // 12. status must be committed
    if (s.status !== 'committed')
      throw new Error(`Non-committed shot in backup: ${s.id}`);
     }

  // 5. No duplicate ids across all 3 stores
  const allIds = new Set<string>();
  for (const a of file.athletes as AthleteRecord[]) {
    if (allIds.has(a.id)) throw new Error(`Duplicate id: athlete ${a.id}`);
    allIds.add(a.id);
     }
  for (const t of file.trainings as TrainingRecord[]) {
    if (allIds.has(t.id)) throw new Error(`Duplicate id: training ${t.id}`);
    allIds.add(t.id);
    }
  for (const s of file.shots as ShotRecord[]) {
    if (allIds.has(s.id)) throw new Error(`Duplicate id: shot ${s.id}`);
    allIds.add(s.id);
     }

  // 4. Referential integrity
  const athleteIdSet = new Set((file.athletes as AthleteRecord[]).map((a) => a.id));
  const trainingIdSet = new Set((file.trainings as TrainingRecord[]).map((t) => t.id));
  for (const t of file.trainings as TrainingRecord[]) {
    if (!athleteIdSet.has(t.athleteId))
      throw new Error(`Training references unknown athlete: ${t.id}`);
     }
  for (const s of file.shots as ShotRecord[]) {
    if (!trainingIdSet.has(s.trainingId))
      throw new Error(`Shot references unknown training: ${s.id}`);
     }

  // 7, 8. nextShotNumber > max(shotNumber); shotNumbers unique per training
  const shotsByTraining = new Map<string, ShotRecord[]>();
  for (const s of file.shots as ShotRecord[]) {
    const arr = shotsByTraining.get(s.trainingId) || [];
    arr.push(s);
    shotsByTraining.set(s.trainingId, arr);
     }
  for (const [tid, shotsArr] of shotsByTraining) {
     const seen = new Set<number>();
    for (const s of shotsArr) {
        if (seen.has(s.shotNumber))
          throw new Error(`Duplicate shotNumber ${s.shotNumber} in training ${tid}`);
        seen.add(s.shotNumber);
         }
    const maxShot = shotsArr.reduce((mx, s) => Math.max(mx, s.shotNumber), 0);
    const tr = (file.trainings as TrainingRecord[]).find((t) => t.id === tid);
    if (tr && maxShot > 0 && tr.nextShotNumber <= maxShot)
      throw new Error(
       `nextShotNumber ${tr.nextShotNumber} <= max shotNumber ${maxShot} in training ${tid}`,
      );
     }

  // 13. Settings whitelist
  const st = file.settings as any;
  for (const key of Object.keys(st)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key))
      throw new Error(`Unknown settings key: ${key}`);
     }
}

// ─── importBackup (§17 "Атомарность и протокол restore") ────────────────────

let _bc: BroadcastChannel | null = null;
function getBC(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!_bc) _bc = new BroadcastChannel('coach-data');
   return _bc;
}

export async function importBackup(data: unknown): Promise<void> {
  // 1. Validate
  validateBackup(data);
  const file = data as BackupFile;

  // 2. Broadcast RESTORE_BEGIN
  const bc = getBC();
  bc?.postMessage({ type: 'RESTORE_BEGIN' });

  const db = await openDB();
  const oldEpoch = await (await getSettingSafe(db, 'dataEpoch')) ?? 1;
  const newEpoch = oldEpoch + 1;

  try {
    // 4. One readwrite tx: clear all, fill, set settings
    await new Promise<void>((resolve, reject) => {
       const tx = db.transaction(
         [STORES.ATHLETES, STORES.TRAININGS, STORES.SHOTS, STORES.SETTINGS],
          'readwrite',
       );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);

      // Clear
      const clearAll = (name: string) => {
        const r = tx.objectStore(name).clear();
        r.onerror = () => reject(r.error);
        };
      clearAll(STORES.ATHLETES);
      clearAll(STORES.TRAININGS);
      clearAll(STORES.SHOTS);
      clearAll(STORES.SETTINGS);

      // Populate
      for (const a of file.athletes) tx.objectStore(STORES.ATHLETES).put(a);
      for (const t of file.trainings) tx.objectStore(STORES.TRAININGS).put(t);
      for (const s of file.shots) {
        s.score = recomputeScore(s.x, s.y); // recalculate, ignore stored score
        tx.objectStore(STORES.SHOTS).put(s);
         }
      tx.objectStore(STORES.SETTINGS).put({ key: 'SCORING_VERSION' as const, value: SCORING_VERSION });
      tx.objectStore(STORES.SETTINGS).put({ key: 'dataEpoch' as const, value: newEpoch });
      tx.objectStore(STORES.SETTINGS).put({ key: 'storagePersisted' as const, value: file.settings.storagePersisted });
      tx.objectStore(STORES.SETTINGS).put({ key: 'lastBackupAt' as const, value: file.settings.lastBackupAt });
    });

    // 5. Broadcast RESTORE_DONE
    bc?.postMessage({ type: 'RESTORE_DONE', dataEpoch: newEpoch });
    } catch (e) {
      // On tx error: broadcast abort
      bc?.postMessage({ type: 'RESTORE_ABORTED' });
      throw e;
     }
}

async function getSettingSafe(db: IDBDatabase, key: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly');
    const r = tx.objectStore('settings').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
     });
}

export function destroyBC() {
  _bc?.close();
  _bc = null;
}

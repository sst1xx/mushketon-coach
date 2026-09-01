import React, { useState, useEffect } from 'react';
import { openDB } from './db/open';
import { initSettings } from './db/settings';
import { runStartupCleanup } from './db/startup';
import { readEpoch } from './db/tx';
import { AthleteRecord, TrainingRecord } from './db/schema';
import AthletesScreen from './screens/AthletesScreen';
import TrainingsScreen from './screens/TrainingsScreen';
import TrainingScreen from './screens/TrainingScreen';
import SettingsScreen from './screens/SettingsScreen';
import RemarksScreen from './screens/RemarksScreen';
import GeneralRemarkScreen from './screens/GeneralRemarkScreen';
import TrainingRemarksScreen from './screens/TrainingRemarksScreen';
import ShotRemarkEditorScreen from './screens/ShotRemarkEditorScreen';
import AllShotsScreen from './screens/AllShotsScreen';
import type { CommentRecord, ShotRecord } from './db/schema';
import { getTrainingMode, getPp3CurrentSeriesNumber } from './domain/trainingMode';
import { applyTheme, isThemeMode } from './utils/theme';
import { getSetting } from './db/settings';
import styles from './App.module.css';

/**
 * Navigation stack (see PLAN-DIARY-IA.md §4): every screen transition is a
 * `push`, every «Назад» is a `pop` — no scattered per-screen `onBack`/
 * `returnTo` fields deciding where to go. Screens that need to remember
 * local context across a push (e.g. TrainingScreen's viewed ПП-3 series
 * while a scoped diary is open on top) update their own stack entry via
 * `replaceTop` immediately before pushing the child screen, so popping back
 * restores that context.
 */
type Screen =
  | { name: 'athletes' }
  | { name: 'trainings'; athlete: AthleteRecord }
  | {
      name: 'training';
      athlete: AthleteRecord;
      training: TrainingRecord;
      showCompletionOnMount?: boolean;
      restoreSeriesView?: number | null;
    }
  | {
      name: 'remarks';
      athlete: AthleteRecord;
      /** Fold state per top-level diary entry (trainingId). Missing key = default, see PLAN-DIARY-FOLD.md §4. */
      foldedTrainings?: Record<string, boolean>;
      /** Fold state per ПП-3 series, keyed by `${trainingId}:${seriesIndex}`. Missing key = default. */
      foldedSeries?: Record<string, boolean>;
    }
  | {
      name: 'generalRemark';
      athlete: AthleteRecord;
      training: TrainingRecord;
      /** `null` edits the exercise-wide/standalone-series comment; a number edits that ПП-3 series' own comment. */
      seriesNumber: number | null;
    }
  | { name: 'trainingRemarks'; athlete: AthleteRecord; training: TrainingRecord; seriesNumber: number | null }
  | {
      name: 'shotRemarkEditor';
      athlete: AthleteRecord;
      comment: CommentRecord;
      shot: ShotRecord | undefined;
    }
  | { name: 'allShots'; athlete: AthleteRecord }
  | { name: 'settings' };

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stack, setStack] = useState<Screen[]>([{ name: 'athletes' }]);
  const [epoch, setEpoch] = useState(1);

  const screen = stack[stack.length - 1];
  const push = (next: Screen) => setStack(st => [...st, next]);
  const pop = () => setStack(st => (st.length > 1 ? st.slice(0, -1) : st));
  const replaceTop = (next: Screen) => setStack(st => [...st.slice(0, -1), next]);
  const reset = (next: Screen) => setStack([next]);

  useEffect(() => {
    (async () => {
      try {
        const db = await openDB();
        await runStartupCleanup(db);
        await initSettings(db);
        const themeMode = await getSetting(db, 'themeMode');
        applyTheme(isThemeMode(themeMode) ? themeMode : 'light');
        const ep = await readEpoch(db);
        setEpoch(ep);
        setReady(true);
      } catch (e: any) {
        setError(e?.message ?? 'Ошибка инициализации');
      }
    })();
  }, []);

  if (error) return <div className={styles.center}><p>{error}</p></div>;
  if (!ready) return <div className={styles.center}><p>Загрузка…</p></div>;

  if (screen.name === 'athletes') {
    return (
      <AthletesScreen
        epoch={epoch}
        onSelectAthlete={(athlete) => push({ name: 'trainings', athlete })}
        onOpenSettings={() => push({ name: 'settings' })}
      />
    );
  }
  if (screen.name === 'settings') {
    return (
      <SettingsScreen onBack={pop} />
    );
  }
  if (screen.name === 'remarks') {
    return (
      <RemarksScreen
        athlete={screen.athlete}
        epoch={epoch}
        foldedTrainings={screen.foldedTrainings}
        foldedSeries={screen.foldedSeries}
        onBack={pop}
        onSelectTraining={(training, focusShotNumber) => {
          const seriesNumber = focusShotNumber !== undefined && getTrainingMode(training) === 'pp3'
            ? getPp3CurrentSeriesNumber(focusShotNumber)
            : null;
          push({ name: 'trainingRemarks', athlete: screen.athlete, training, seriesNumber });
        }}
        onOpenGeneralRemark={(training, seriesNumber = null) => push({ name: 'generalRemark', athlete: screen.athlete, training, seriesNumber })}
        onOpenSeriesDiary={(training, seriesNumber) => push({ name: 'trainingRemarks', athlete: screen.athlete, training, seriesNumber })}
        onEditShotComment={(comment, shot) => push({ name: 'shotRemarkEditor', athlete: screen.athlete, comment, shot })}
        onToggleTrainingFold={(trainingId, currentFolded) => replaceTop({
          ...screen,
          foldedTrainings: { ...screen.foldedTrainings, [trainingId]: !currentFolded },
        })}
        onToggleSeriesFold={(trainingId, seriesIndex, currentFolded) => {
          const key = `${trainingId}:${seriesIndex}`;
          replaceTop({
            ...screen,
            foldedSeries: { ...screen.foldedSeries, [key]: !currentFolded },
          });
        }}
        onCollapseAll={(state) => replaceTop({ ...screen, foldedTrainings: state.foldedTrainings, foldedSeries: state.foldedSeries })}
        onExpandAll={(state) => replaceTop({ ...screen, foldedTrainings: state.foldedTrainings, foldedSeries: state.foldedSeries })}
      />
    );
  }
  if (screen.name === 'shotRemarkEditor') {
    return (
      <ShotRemarkEditorScreen
        athlete={screen.athlete}
        comment={screen.comment}
        shot={screen.shot}
        onBack={pop}
      />
    );
  }
  if (screen.name === 'generalRemark') {
    return (
      <GeneralRemarkScreen
        athlete={screen.athlete}
        training={screen.training}
        seriesNumber={screen.seriesNumber}
        onBack={pop}
      />
    );
  }
  if (screen.name === 'trainingRemarks') {
    return (
      <TrainingRemarksScreen
        athlete={screen.athlete}
        training={screen.training}
        seriesNumber={screen.seriesNumber}
        onBack={pop}
        onOpenGeneralRemark={(training, targetSeriesNumber) =>
          push({ name: 'generalRemark', athlete: screen.athlete, training, seriesNumber: targetSeriesNumber })
        }
        onOpenAllRemarks={() => push({ name: 'remarks', athlete: screen.athlete })}
        onOpenTarget={(training, seriesNumber) =>
          push({ name: 'training', athlete: screen.athlete, training, restoreSeriesView: seriesNumber })
        }
        onOpenSeriesDiary={(training, seriesNumber) =>
          push({ name: 'trainingRemarks', athlete: screen.athlete, training, seriesNumber })
        }
        onEditShotComment={(comment, shot) => push({ name: 'shotRemarkEditor', athlete: screen.athlete, comment, shot })}
      />
    );
  }
  if (screen.name === 'allShots') {
    return (
      <AllShotsScreen
        athlete={screen.athlete}
        onBack={pop}
      />
    );
  }
  if (screen.name === 'trainings') {
    return (
      <TrainingsScreen
        athlete={screen.athlete}
        epoch={epoch}
        onBack={pop}
        onSelectTraining={(training) => push({ name: 'training', athlete: screen.athlete, training })}
        onOpenRemarks={() => push({ name: 'remarks', athlete: screen.athlete })}
        onOpenAllShots={() => push({ name: 'allShots', athlete: screen.athlete })}
      />
    );
  }
  if (screen.name === 'training') {
    return (
      <TrainingScreen
        athlete={screen.athlete}
        training={screen.training}
        epoch={epoch}
        onBack={pop}
        onNewTraining={(newTraining) => replaceTop({ name: 'training', athlete: screen.athlete, training: newTraining })}
        onOpenGeneralRemark={(training) => {
          // The completion modal's «Общее замечание» always targets the
          // exercise/series as a whole (seriesNumber: null) — per-series
          // comments are only reachable from the scoped diary (§6).
          replaceTop({ name: 'training', athlete: screen.athlete, training, showCompletionOnMount: true });
          push({ name: 'generalRemark', athlete: screen.athlete, training, seriesNumber: null });
        }}
        onOpenTrainingRemarks={(training, seriesNumber) => {
          replaceTop({ name: 'training', athlete: screen.athlete, training, restoreSeriesView: seriesNumber });
          push({ name: 'trainingRemarks', athlete: screen.athlete, training, seriesNumber });
        }}
        showCompletionOnMount={screen.showCompletionOnMount}
        restoreSeriesView={screen.restoreSeriesView}
      />
    );
  }
  return null;
}

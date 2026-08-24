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
import AllShotsScreen from './screens/AllShotsScreen';
import styles from './App.module.css';

type Screen = 
  | { name: 'athletes' }
  | { name: 'trainings'; athlete: AthleteRecord }
  | { name: 'training'; athlete: AthleteRecord; training: TrainingRecord }
  | { name: 'remarks'; athlete: AthleteRecord }
  | { name: 'allShots'; athlete: AthleteRecord }
  | { name: 'settings' };

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ name: 'athletes' });
  const [epoch, setEpoch] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const db = await openDB();
        await runStartupCleanup(db);
        await initSettings(db);
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
        onSelectAthlete={(athlete) => setScreen({ name: 'trainings', athlete })}
        onOpenSettings={() => setScreen({ name: 'settings' })}
      />
    );
  }
  if (screen.name === 'settings') {
    return (
      <SettingsScreen onBack={() => setScreen({ name: 'athletes' })} />
    );
  }
  if (screen.name === 'remarks') {
    return (
      <RemarksScreen
        athlete={screen.athlete}
        epoch={epoch}
        onBack={() => setScreen({ name: 'trainings', athlete: screen.athlete })}
        onSelectTraining={(training) => setScreen({ name: 'training', athlete: screen.athlete, training })}
      />
    );
  }
  if (screen.name === 'allShots') {
    return (
      <AllShotsScreen
        athlete={screen.athlete}
        onBack={() => setScreen({ name: 'trainings', athlete: screen.athlete })}
      />
    );
  }
  if (screen.name === 'trainings') {
    return (
      <TrainingsScreen
        athlete={screen.athlete}
        epoch={epoch}
        onBack={() => setScreen({ name: 'athletes' })}
        onSelectTraining={(training) => setScreen({ name: 'training', athlete: screen.athlete, training })}
        onOpenRemarks={() => setScreen({ name: 'remarks', athlete: screen.athlete })}
        onOpenAllShots={() => setScreen({ name: 'allShots', athlete: screen.athlete })}
      />
    );
  }
  if (screen.name === 'training') {
    return (
      <TrainingScreen
        athlete={screen.athlete}
        training={screen.training}
        epoch={epoch}
        onBack={() => setScreen({ name: 'trainings', athlete: screen.athlete })}
        onNewTraining={(newTraining) => setScreen({ name: 'training', athlete: screen.athlete, training: newTraining })}
      />
    );
  }
  return null;
}

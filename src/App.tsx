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

type Screen = 
  | { name: 'athletes' }
  | { name: 'trainings'; athlete: AthleteRecord }
  | { name: 'training'; athlete: AthleteRecord; training: TrainingRecord }
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

  if (error) return <div style={styles.center}><p>{error}</p></div>;
  if (!ready) return <div style={styles.center}><p>Загрузка…</p></div>;

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
  if (screen.name === 'trainings') {
    return (
      <TrainingsScreen
        athlete={screen.athlete}
        epoch={epoch}
        onBack={() => setScreen({ name: 'athletes' })}
        onSelectTraining={(training) => setScreen({ name: 'training', athlete: screen.athlete, training })}
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
      />
    );
  }
  return null;
}

const styles = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' } as React.CSSProperties,
};

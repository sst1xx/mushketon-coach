import React, { useState, useEffect } from 'react';
import { openDB } from './db/open';
import { initSettings } from './db/settings';
import { runStartupCleanup } from './db/startup';
import { readEpoch } from './db/tx';
import { AthleteRecord } from './db/schema';
import AthletesScreen from './screens/AthletesScreen';
import TrainingsScreen from './screens/TrainingsScreen';

type Screen = { name: 'athletes' } | { name: 'trainings'; athlete: AthleteRecord };

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
      />
    );
  }
  if (screen.name === 'trainings') {
    return (
      <TrainingsScreen
        athlete={screen.athlete}
        epoch={epoch}
        onBack={() => setScreen({ name: 'athletes' })}
      />
    );
  }
  return null;
}

const styles = {
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' } as React.CSSProperties,
};

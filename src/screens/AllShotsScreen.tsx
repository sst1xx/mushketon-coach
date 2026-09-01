import React, { useState, useEffect, useMemo } from 'react';
import { openDB } from '../db/open';
import { AthleteRecord, TrainingRecord } from '../db/schema';
import { listAllShotsForAthlete, AllShotsEntry } from '../domain/allShotsRepo';
import { listTrainings } from '../domain/trainingRepo';
import { formatCommentLine } from './allShotsCaption';
import { filterAllShotsEntries } from './allShotsFilter';
import TargetCanvas from '../components/TargetCanvas';
import { getSetting, setSetting } from '../db/settings';
import s from './AllShotsScreen.module.css';

const ZOOM_LABELS: Record<'full' | 'zoom7' | 'zoom9', string> = {
  full: '🔍 1-10',
  zoom7: '🔍 7-10',
  zoom9: '🔍 9-10',
};

// Zoom modes in cyclical order — extend here to add intermediate zoom levels
const ZOOM_MODES: Array<'full' | 'zoom7' | 'zoom9'> = ['full', 'zoom7', 'zoom9'];

const ALL_TRAININGS_VALUE = 'all';
const RECENT_TRAININGS_LIMIT = 10;

const trainingDateFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const trainingTimeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

interface Props {
  athlete: AthleteRecord;
  onBack: () => void;
}

export default function AllShotsScreen({ athlete, onBack }: Props) {
  const [entries, setEntries] = useState<AllShotsEntry[]>([]);
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [selectedTrainingId, setSelectedTrainingId] = useState<string>(ALL_TRAININGS_VALUE);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomMode, setZoomMode] = useState<'full' | 'zoom7' | 'zoom9'>('full');

  useEffect(() => {
    (async () => {
      const [loaded, loadedTrainings] = await Promise.all([
        listAllShotsForAthlete(athlete.id),
        listTrainings(athlete.id),
      ]);
      setEntries(loaded);
      setTrainings(loadedTrainings);
      const db = await openDB();
      const zm = await getSetting(db, 'targetZoomMode');
      if (zm === 'zoom7' || zm === 'zoom9' || zm === 'full') setZoomMode(zm);
      setLoading(false);
    })();
  }, [athlete.id]);

  // Chronological order (oldest first), matching listAllShotsForAthlete's globalNumber order.
  const trainingsChronological = useMemo(
    () =>
      [...trainings].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()),
    [trainings],
  );

  // Most recent first, used for the select's option order in both branches.
  const trainingsByRecency = useMemo(
    () => [...trainingsChronological].reverse(),
    [trainingsChronological],
  );
  const showRecentGroup = trainingsChronological.length > RECENT_TRAININGS_LIMIT;

  const shotCountByTrainingId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      counts.set(e.trainingId, (counts.get(e.trainingId) ?? 0) + 1);
    }
    return counts;
  }, [entries]);

  // Show the time alongside the date only when two or more trainings share the same
  // calendar date — otherwise the date alone is unambiguous.
  const needsTimeInLabel = useMemo(() => {
    const dateCounts = new Map<string, number>();
    for (const training of trainingsChronological) {
      const dateKey = trainingDateFormatter.format(new Date(training.startedAt));
      dateCounts.set(dateKey, (dateCounts.get(dateKey) ?? 0) + 1);
    }
    return [...dateCounts.values()].some((count) => count >= 2);
  }, [trainingsChronological]);

  // When a specific training is selected, filter to its entries and renumber 1..N within it.
  const displayedEntries = useMemo(
    () => filterAllShotsEntries(entries, selectedTrainingId === ALL_TRAININGS_VALUE ? null : selectedTrainingId),
    [entries, selectedTrainingId],
  );

  const shots = displayedEntries.map(e => e.shot);
  const commentedShotIds = new Set(displayedEntries.filter(e => e.hasComment).map(e => e.shot.id));
  const tooltipByShotId = new Map(displayedEntries.filter(e => e.hasComment).map(e => [e.shot.id, e.commentText as string]));
  const shotLabels = new Map(
    displayedEntries.filter(e => e.globalNumber <= 99).map(e => [e.shot.id, e.globalNumber]),
  );

  const lastEntry = displayedEntries.length > 0 ? displayedEntries[displayedEntries.length - 1] : null;
  const selectedEntry = selectedShotId ? displayedEntries.find(e => e.shot.id === selectedShotId) ?? null : null;
  const targetEntry = selectedEntry ?? lastEntry;

  const displayLabel = (() => {
    if (!targetEntry) return '–';
    const scoreLabel = targetEntry.shot.score > 0 ? (targetEntry.shot.score / 10).toFixed(1) : '0.0';
    return `№${targetEntry.globalNumber} • ${scoreLabel}`;
  })();
  const commentLine = formatCommentLine(targetEntry);

  const toggleZoom = async () => {
    const currentIdx = ZOOM_MODES.indexOf(zoomMode);
    const next = ZOOM_MODES[(currentIdx + 1) % ZOOM_MODES.length];
    setZoomMode(next);
    const db = await openDB();
    await setSetting(db, 'targetZoomMode', next);
  };

  const handleTrainingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTrainingId(e.target.value);
    setSelectedShotId(null);
  };

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
      </div>

      <div className={s.filterRow}>
        <select
          className={s.trainingSelect}
          value={selectedTrainingId}
          onChange={handleTrainingChange}
          aria-label="Тренировка"
        >
          <option value={ALL_TRAININGS_VALUE}>Все тренировки</option>
          {(() => {
            const renderOption = (training: TrainingRecord) => {
              const startedAt = new Date(training.startedAt);
              const dateLabel = trainingDateFormatter.format(startedAt);
              const label = needsTimeInLabel ? `${dateLabel}, ${trainingTimeFormatter.format(startedAt)}` : dateLabel;
              return (
                <option key={training.id} value={training.id}>
                  {label} • {shotCountByTrainingId.get(training.id) ?? 0} выстрелов
                </option>
              );
            };
            if (showRecentGroup) {
              return (
                <optgroup label={`последние ${RECENT_TRAININGS_LIMIT}`}>
                  {trainingsByRecency.slice(0, RECENT_TRAININGS_LIMIT).map(renderOption)}
                </optgroup>
              );
            }
            return trainingsByRecency.map(renderOption);
          })()}
        </select>
      </div>

      <div className={s.targetWrap}>
        <TargetCanvas
          shots={shots}
          dragging={null}
          selectedShotId={selectedShotId}
          zoomMode={zoomMode}
          readOnly
          onSelectShot={setSelectedShotId}
          commentedShotIds={commentedShotIds}
          shotTooltip={(shotId) => tooltipByShotId.get(shotId) ?? null}
          shotLabels={shotLabels}
        />
      </div>

      <div className={s.scoreDisplay}>{displayLabel}</div>
      <div className={s.commentDisplay}>{commentLine}</div>

      <div className={s.toolbar}>
        <button
          className={s.zoomToggle}
          onClick={toggleZoom}
          aria-label="Масштаб"
        >
          {ZOOM_LABELS[zoomMode]}
        </button>
      </div>
    </div>
  );
}

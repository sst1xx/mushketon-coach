import React, { useState, useEffect } from 'react';
import { openDB } from '../db/open';
import { AthleteRecord } from '../db/schema';
import { listAllShotsForAthlete, AllShotsEntry } from '../domain/allShotsRepo';
import { formatCommentLine } from './allShotsCaption';
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

interface Props {
  athlete: AthleteRecord;
  onBack: () => void;
}

export default function AllShotsScreen({ athlete, onBack }: Props) {
  const [entries, setEntries] = useState<AllShotsEntry[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomMode, setZoomMode] = useState<'full' | 'zoom7' | 'zoom9'>('full');

  useEffect(() => {
    (async () => {
      const loaded = await listAllShotsForAthlete(athlete.id);
      setEntries(loaded);
      const db = await openDB();
      const zm = await getSetting(db, 'targetZoomMode');
      if (zm === 'zoom7' || zm === 'zoom9' || zm === 'full') setZoomMode(zm);
      setLoading(false);
    })();
  }, [athlete.id]);

  const shots = entries.map(e => e.shot);
  const commentedShotIds = new Set(entries.filter(e => e.hasComment).map(e => e.shot.id));
  const tooltipByShotId = new Map(entries.filter(e => e.hasComment).map(e => [e.shot.id, e.commentText as string]));
  const shotLabels = new Map(
    entries.filter(e => e.globalNumber <= 99).map(e => [e.shot.id, e.globalNumber]),
  );

  const lastEntry = entries.length > 0 ? entries[entries.length - 1] : null;
  const selectedEntry = selectedShotId ? entries.find(e => e.shot.id === selectedShotId) ?? null : null;
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

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
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

import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { score } from '../scoring';
import { AthleteRecord, TrainingRecord, ShotRecord } from '../db/schema';
import {
   createDraft,
   commitShot,
   deleteDraft,
   listShots,
   undoLastShot,
} from '../domain/shotRepo';
import { completeTraining } from '../domain/trainingRepo';
import TargetCanvas from '../components/TargetCanvas';
import { getSetting, setSetting } from '../db/settings';

interface Props {
  athlete: AthleteRecord;
  training: TrainingRecord;
  epoch: number;
  onBack: () => void;
}

// Zoom modes in cyclical order — extend here to add intermediate zoom levels
const ZOOM_MODES: Array<'full' | 'zoom7'> = ['full', 'zoom7'];

export default function TrainingScreen({ athlete, training, epoch, onBack }: Props) {
  const [shots, setShots] = useState<ShotRecord[]>([]);
  const [dragging, setDragging] = useState<{ shotId: string; xh: number; yh: number; isNew: boolean } | null>(null);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [zoomMode, setZoomMode] = useState<'full' | 'zoom7'>('full');
  // Guards the async undo against rapid repeated clicks (stale state / double deletes).
  const [busy, setBusy] = useState(false);

   // Load shots and settings on mount
  useEffect(() => {
    (async () => {
      const loaded = await listShots(training.id);
      setShots(loaded);
      const db = await openDB();
      const zm = await getSetting(db, 'targetZoomMode');
      if (zm === 'zoom7' || zm === 'full') setZoomMode(zm);
      setLoading(false);
    })();
   }, [training.id]);

   // Score display
  const displayScore = (() => {
    if (dragging) {
      const tenths = score(dragging.xh, dragging.yh);
      if (tenths === 0) return '0.0';
      return (tenths / 10).toFixed(1);
    }
    const lastCommitted = shots[shots.length - 1];
    if (lastCommitted && lastCommitted.score > 0) return (lastCommitted.score / 10).toFixed(1);
    return '–';
  })();

   // Shot number for header
  const shotNumber = training.nextShotNumber;

  const handleDragStart = async (shotId: string | null, xh: number, yh: number, isExisting: boolean) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    if (!isExisting) {
      const draft = await createDraft(training.id, xh, yh, ep);
      setDragging({ shotId: draft.id, xh, yh, isNew: true });
      setShots(prev => [...prev, draft]);
    } else {
      setDragging({ shotId: shotId!, xh, yh, isNew: false });
    }
  };

  const handleDragMove = (xh: number, yh: number) => {
    if (!dragging) return;
    setDragging(prev => prev ? { ...prev, xh, yh } : null);
  };

  const handleDragEnd = async (xh: number, yh: number) => {
    if (!dragging) return;
    const db = await openDB();
    const ep = await readEpoch(db);
    const updated = await commitShot(dragging.shotId, xh, yh, ep);
    setShots(prev => prev.map(s => s.id === updated.id ? updated : s).sort((a, b) => a.shotNumber - b.shotNumber));
    setDragging(null);
  };

  const handleDragCancel = async () => {
    if (!dragging) return;
    if (dragging.isNew) {
      const db = await openDB();
      const ep = await readEpoch(db);
      await deleteDraft(dragging.shotId, ep);
      setShots(prev => prev.filter(s => s.id !== dragging.shotId));
    }
    setDragging(null);
  };

   // Undo: delete the most recent shot (LIFO). Selection of the last-created
   // shot happens in the domain (undoLastShot reads fresh shots from
   // IndexedDB), so repeated clicks always target the current last shot
   // without relying on stale React state. nextShotNumber is monotonic and is
   // deliberately NOT decremented here.
  const canUndo = shots.length > 0 && dragging === null && !busy;

  const handleUndo = async () => {
    if (!canUndo || busy) return;
    setBusy(true);
    try {
      const db = await openDB();
      const ep = await readEpoch(db);
      await undoLastShot(training.id, ep); // no-op when training has no shots
      setShots(await listShots(training.id));
    } finally {
      setBusy(false);
    }
  };

  const handleComplete = async () => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await completeTraining(training.id, ep);
    setShowCompleteConfirm(false);
    onBack();
  };

   // Toggle zoom mode cyclically
  const toggleZoom = async () => {
    const currentIdx = ZOOM_MODES.indexOf(zoomMode);
    const next = ZOOM_MODES[(currentIdx + 1) % ZOOM_MODES.length];
    setZoomMode(next);
    const db = await openDB();
    await setSetting(db, 'targetZoomMode', next);
  };

   // Confirm dialog content
  const committedCount = shots.filter(s => s.status === 'committed').length;
  const avgScore = committedCount > 0
    ? (shots.filter(s => s.status === 'committed').reduce((sum, s) => sum + s.score, 0) / committedCount / 10)
    : 0;

  if (loading) return <div style={s.page}><p>Загрузка…</p></div>;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.back} onClick={onBack}>◀ Назад</button>
        <span style={s.athleteName}>{athlete.name}</span>
        <span style={s.shotNum}>№{shotNumber}</span>
        <button style={s.zoomToggle} onClick={toggleZoom}>
          Масштаб
        </button>
      </div>

      {/* Target */}
      <TargetCanvas
        shots={shots}
        dragging={dragging}
        zoomMode={zoomMode}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      />

      {/* Score */}
      <div style={s.scoreDisplay}>{displayScore}</div>

      {/* Bottom toolbar */}
      <div style={s.toolbar}>
        <button
          style={{ ...s.undoBtn, opacity: canUndo ? 1 : 0.4 }}
          onClick={handleUndo}
          disabled={!canUndo}
        >
          UNDO
        </button>
        <button style={s.completeBtn} onClick={() => setShowCompleteConfirm(true)}>
          Завершить
        </button>
      </div>

      {/* Complete confirmation dialog */}
      {showCompleteConfirm && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <p>Завершить тренировку?</p>
            <p style={s.dialogInfo}>{committedCount} выстрелов</p>
            <p style={s.dialogInfo}>Среднее {avgScore.toFixed(2)}</p>
            <div style={s.dialogBtns}>
              <button style={s.btnGhost} onClick={() => setShowCompleteConfirm(false)}>
                Продолжить
              </button>
              <button style={s.btnDanger} onClick={handleComplete}>
                Завершить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:           { display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', userSelect: 'none' },
  header:         { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 4px', flexShrink: 0 },
  back:           { background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', color: '#1a1a2e', padding: '4px 0' },
  athleteName:    { fontSize: 16, fontWeight: 600, flex: 1 },
  shotNum:        { fontSize: 16, color: '#666' },
  zoomToggle:     { background: 'none', border: '1px solid #ccc', borderRadius: 6, fontSize: 14, padding: '4px 8px', cursor: 'pointer', lineHeight: 1, minWidth: 40, textAlign: 'center' as const },
  scoreDisplay: { textAlign: 'center', fontSize: 48, fontWeight: 700, padding: '4px 0', fontVariantNumeric: 'tabular-nums', color: '#1a1a2e', flexShrink: 0 },
  toolbar:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px 16px', flexShrink: 0 },
  undoBtn:        { padding: '8px 16px', fontSize: 14, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  completeBtn:    { padding: '8px 16px', fontSize: 14, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog:         { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 320, width: '90%', textAlign: 'center' },
  dialogInfo:     { color: '#555', fontSize: 15, margin: '4px 0' },
  dialogBtns:     { display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 },
  btnGhost:       { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  btnDanger:      { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
};

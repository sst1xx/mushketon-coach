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
import {
  createTraining,
  completeTraining,
  shouldCompleteTrainingAfterShot,
} from '../domain/trainingRepo';
import TargetCanvas from '../components/TargetCanvas';
import { getSetting, setSetting } from '../db/settings';
import {
  createComment,
  listCommentsByShot,
  updateComment,
  deleteComment,
} from '../domain/commentRepo';

interface Props {
  athlete: AthleteRecord;
  training: TrainingRecord;
  epoch: number;
  onBack: () => void;
  onNewTraining?: (newTraining: TrainingRecord) => void;
}

// Zoom modes in cyclical order — extend here to add intermediate zoom levels
const ZOOM_MODES: Array<'full' | 'zoom7' | 'zoom9'> = ['full', 'zoom7', 'zoom9'];

export default function TrainingScreen({ athlete, training, epoch, onBack, onNewTraining }: Props) {
  const [currentTraining, setCurrentTraining] = useState<TrainingRecord>(training);
  const [shots, setShots] = useState<ShotRecord[]>([]);
  const [dragging, setDragging] = useState<{ shotId: string; xh: number; yh: number; isNew: boolean } | null>(null);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomMode, setZoomMode] = useState<'full' | 'zoom7' | 'zoom9'>('full');
  // Guards the async undo against rapid repeated clicks (stale state / double deletes).
  const [busy, setBusy] = useState(false);
  // comment modal state
  const [commentModal, setCommentModal] = useState<{ shotId: string; shotNumber: number; existingCommentId: string | null } | null>(null);
  const [commentText, setCommentText] = useState('');
  // Completed limit warning modal
  const [showCompletedModal, setShowCompletedModal] = useState(false);

  // Load shots and settings on mount / training switch
  useEffect(() => {
    (async () => {
      setCurrentTraining(training);
      const loaded = await listShots(training.id);
      setShots(loaded);
      setSelectedShotId(null);
      const db = await openDB();
      const zm = await getSetting(db, 'targetZoomMode');
      if (zm === 'zoom7' || zm === 'zoom9' || zm === 'full') setZoomMode(zm);
      setLoading(false);
    })();
  }, [training]);

  const lastShot = shots.length > 0 ? shots[shots.length - 1] : null;
  const targetShot = (selectedShotId ? shots.find(s => s.id === selectedShotId) : null) ?? lastShot;
  const committedCount = shots.filter(s => s.status === 'committed').length;

  const isCompleted = Boolean(currentTraining.completedAt);
  const isLimited = typeof currentTraining.targetShotCount === 'number' && currentTraining.targetShotCount > 0;
  const limit = currentTraining.targetShotCount ?? null;

  // Score display
  const displayScore = (() => {
    if (dragging) {
      const tenths = score(dragging.xh, dragging.yh);
      if (tenths === 0) return '0.0';
      return (tenths / 10).toFixed(1);
    }
    if (targetShot && targetShot.score > 0) return (targetShot.score / 10).toFixed(1);
    return '–';
  })();

  const handleDragStart = async (shotId: string | null, xh: number, yh: number, isExisting: boolean) => {
    // If completed or limit reached for a new shot, do not allow adding new shots
    if (!isExisting) {
      if (isCompleted) return;
      if (isLimited && committedCount >= limit!) return;
    }

    const db = await openDB();
    const ep = await readEpoch(db);
    if (!isExisting) {
      const draft = await createDraft(currentTraining.id, xh, yh, ep);
      setSelectedShotId(draft.id);
      setDragging({ shotId: draft.id, xh, yh, isNew: true });
      setShots(prev => [...prev, draft]);
    } else {
      setSelectedShotId(shotId);
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
    const updatedShots = shots.map(s => s.id === updated.id ? updated : s);
    if (!shots.some(s => s.id === updated.id)) {
      updatedShots.push(updated);
    }
    updatedShots.sort((a, b) => a.shotNumber - b.shotNumber);
    setShots(updatedShots);
    setSelectedShotId(updated.id);
    setDragging(null);

    // If training has a limit and is not yet completed, check if limit is reached
    const newCommittedCount = updatedShots.filter(s => s.status === 'committed').length;
    if (shouldCompleteTrainingAfterShot(currentTraining, newCommittedCount)) {
      const completed = await completeTraining(currentTraining.id, ep);
      setCurrentTraining(completed);
      setShowCompletedModal(true);
    }
  };

  const handleDragCancel = async () => {
    if (!dragging) return;
    if (dragging.isNew) {
      const db = await openDB();
      const ep = await readEpoch(db);
      await deleteDraft(dragging.shotId, ep);
      setShots(prev => prev.filter(s => s.id !== dragging.shotId));
      setSelectedShotId(null);
    }
    setDragging(null);
  };

  // Undo: delete the most recent shot (LIFO).
  const canUndo = shots.length > 0 && dragging === null && !busy;

  const handleUndo = async () => {
    if (!canUndo || busy) return;
    setBusy(true);
    try {
      const db = await openDB();
      const ep = await readEpoch(db);
      await undoLastShot(currentTraining.id, ep);
      const updated = await listShots(currentTraining.id);
      setShots(updated);
      setSelectedShotId(prev => (prev && updated.some(s => s.id === prev) ? prev : null));
    } finally {
      setBusy(false);
    }
  };

  // Create new training for the current athlete
  const handleCreateNewTraining = async () => {
    const db = await openDB();
    const ep = await readEpoch(db);
    const newT = await createTraining(athlete.id, ep);
    setShowCompletedModal(false);
    if (onNewTraining) {
      onNewTraining(newT);
    } else {
      setCurrentTraining(newT);
      setShots([]);
      setSelectedShotId(null);
    }
  };

  // Open comment modal for target shot (selected or last)
  const handleOpenComment = async () => {
    if (!targetShot) return;
    const existing = await listCommentsByShot(targetShot.id);
    const first = existing[0] ?? null;
    setCommentText(first ? first.text : '');
    setCommentModal({ shotId: targetShot.id, shotNumber: targetShot.shotNumber, existingCommentId: first ? first.id : null });
  };

  const handleSaveComment = async () => {
    if (!commentModal) return;
    const trimmed = commentText.trim();
    const db = await openDB();
    const ep = await readEpoch(db);
    if (commentModal.existingCommentId) {
      if (trimmed) {
        await updateComment(commentModal.existingCommentId, trimmed, ep);
      } else {
        await deleteComment(commentModal.existingCommentId, ep);
      }
    } else if (trimmed) {
      await createComment(
        { athleteId: athlete.id, trainingId: currentTraining.id, shotId: commentModal.shotId, text: trimmed },
        ep,
      );
    }
    setCommentModal(null);
  };

  // Toggle zoom mode cyclically
  const toggleZoom = async () => {
    const currentIdx = ZOOM_MODES.indexOf(zoomMode);
    const next = ZOOM_MODES[(currentIdx + 1) % ZOOM_MODES.length];
    setZoomMode(next);
    const db = await openDB();
    await setSetting(db, 'targetZoomMode', next);
  };

  if (loading) return <div style={s.page}><p>Загрузка…</p></div>;

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <button style={s.back} onClick={onBack}>◀ Назад</button>
        <span style={s.athleteName}>{athlete.name}</span>
        <span style={s.shotNum}>
          {isLimited ? `Выстрелы: ${committedCount} / ${limit}` : `Выстрелы: ${committedCount}`}
        </span>
      </div>

      {/* Completed notification banner */}
      {isCompleted && (
        <div style={s.completedBanner}>
          <span style={s.completedBannerText}>Тренировка завершена</span>
          <button
            style={s.newTrainingBannerBtn}
            onClick={handleCreateNewTraining}
            aria-label="Новая тренировка"
          >
            + Новая тренировка
          </button>
        </div>
      )}

      {/* Target */}
      <TargetCanvas
        shots={shots}
        dragging={dragging}
        selectedShotId={selectedShotId}
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
          Отменить последний
        </button>
        <button
          style={s.zoomToggle}
          onClick={toggleZoom}
          aria-label="Масштаб"
        >
          Масштаб
        </button>
        <button
          style={{ ...s.commentBtn, opacity: targetShot && dragging === null ? 1 : 0.4 }}
          onClick={handleOpenComment}
          disabled={!targetShot || dragging !== null}
          aria-label="Добавить замечание"
        >
          💬
        </button>
        {isCompleted && (
          <button
            style={s.newTrainingBtn}
            onClick={handleCreateNewTraining}
            aria-label="Новая тренировка"
          >
            + Новая
          </button>
        )}
      </div>

      {/* Completed limit modal warning */}
      {showCompletedModal && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <p style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px', color: '#1a1a2e' }}>
              Тренировка завершена
            </p>
            <p style={s.dialogInfo}>
              Выполнено {committedCount} из {limit ?? committedCount} выстрелов. Достигнут лимит серии.
            </p>
            <div style={s.dialogBtns}>
              <button style={s.btnGhost} onClick={() => setShowCompletedModal(false)}>
                Просмотр
              </button>
              <button
                style={s.btnPrimary}
                onClick={handleCreateNewTraining}
              >
                + Новая тренировка
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment modal */}
      {commentModal && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <p style={s.dialogInfo}>Замечание к выстрелу №{commentModal.shotNumber}</p>
            <textarea
              style={s.commentTextarea}
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              rows={4}
              maxLength={1000}
              autoFocus
              placeholder="Введите замечание…"
            />
            <div style={s.dialogBtns}>
              <button style={s.btnGhost} onClick={() => setCommentModal(null)}>Отмена</button>
              <button
                style={{ ...s.btnDanger, background: '#1a1a2e', opacity: (commentText.trim() || commentModal.existingCommentId) ? 1 : 0.5 }}
                onClick={handleSaveComment}
                disabled={!commentText.trim() && !commentModal.existingCommentId}
              >
                Сохранить
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
  athleteName:    { fontSize: 16, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  shotNum:        { fontSize: 14, color: '#666', whiteSpace: 'nowrap' },
  zoomToggle:     { background: 'none', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, padding: '8px 10px', cursor: 'pointer', lineHeight: 1, textAlign: 'center' as const, flexShrink: 0, whiteSpace: 'nowrap' as const },
  scoreDisplay:   { textAlign: 'center', fontSize: 48, fontWeight: 700, padding: '4px 0', fontVariantNumeric: 'tabular-nums', color: '#1a1a2e', flexShrink: 0 },
  completedBanner:{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 16px', background: '#f0f2f5', borderBottom: '1px solid #e2e4e8', flexShrink: 0 },
  completedBannerText: { fontSize: 13, fontWeight: 600, color: '#1a1a2e' },
  newTrainingBannerBtn:{ padding: '4px 10px', fontSize: 13, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' as const },
  toolbar:        { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '8px 12px 16px', flexShrink: 0, boxSizing: 'border-box' as const },
  undoBtn:        { padding: '8px 10px', fontSize: 13, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const },
  commentBtn:     { padding: '8px 10px', fontSize: 18, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer', lineHeight: 1, flexShrink: 0 },
  newTrainingBtn: { padding: '8px 10px', fontSize: 13, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' as const },
  commentTextarea:{ width: '100%', fontSize: 15, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box' as const, resize: 'vertical' as const, fontFamily: 'sans-serif' },
  completeBtn:    { padding: '8px 16px', fontSize: 14, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
  overlay:        { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog:         { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 320, width: '90%', textAlign: 'center' },
  dialogInfo:     { color: '#555', fontSize: 15, margin: '4px 0' },
  dialogBtns:     { display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 },
  btnGhost:       { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  btnDanger:      { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
  btnPrimary:     { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer', fontWeight: 600 },
};

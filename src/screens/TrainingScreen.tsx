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
import Modal from '../components/Modal';
import { useWakeLock } from '../utils/useWakeLock';
import s from './TrainingScreen.module.css';

const ZOOM_LABELS: Record<'full' | 'zoom7' | 'zoom9', string> = {
  full: '🎯 1-10',
  zoom7: '🔍 7-10',
  zoom9: '🔬 9-10',
};

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
  // Commit confirmation toast ("№N • 10.4") shown briefly after each committed shot
  const [toast, setToast] = useState<string | null>(null);

  // Keep the screen awake while the training screen is open (active series).
  useWakeLock(true);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1200);
    return () => clearTimeout(timer);
  }, [toast]);

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

    // Haptic + toast confirmation feedback on commit.
    navigator.vibrate?.(15);
    const scoreLabel = updated.score > 0 ? (updated.score / 10).toFixed(1) : '0.0';
    setToast(`№${updated.shotNumber} • ${scoreLabel}`);

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

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
        <span className={s.shotNum}>
          {isLimited ? `Выстрелы: ${committedCount} / ${limit}` : `Выстрелы: ${committedCount}`}
        </span>
      </div>

      {/* Completed notification banner */}
      {isCompleted && (
        <div className={s.completedBanner}>
          <span className={s.completedBannerText}>Тренировка завершена</span>
          <button
            className={s.newTrainingBannerBtn}
            onClick={handleCreateNewTraining}
            aria-label="Новая тренировка"
          >
            + Новая тренировка
          </button>
        </div>
      )}

      {/* Target + commit confirmation toast */}
      <div className={s.targetWrap}>
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
        {toast && <div className={s.toast}>{toast}</div>}
      </div>

      {/* Score */}
      <div className={s.scoreDisplay}>{displayScore}</div>

      {/* Bottom toolbar */}
      <div className={s.toolbar}>
        <button
          className={`${s.undoBtn} ${canUndo ? '' : s.disabled}`}
          onClick={handleUndo}
          disabled={!canUndo}
        >
          Отменить последний
        </button>
        <button
          className={s.zoomToggle}
          onClick={toggleZoom}
          aria-label="Масштаб"
        >
          {ZOOM_LABELS[zoomMode]}
        </button>
        <button
          className={`${s.commentBtn} ${targetShot && dragging === null ? '' : s.disabled}`}
          onClick={handleOpenComment}
          disabled={!targetShot || dragging !== null}
          aria-label="Добавить замечание"
        >
          💬
        </button>
        {isCompleted && (
          <button
            className={s.newTrainingBtn}
            onClick={handleCreateNewTraining}
            aria-label="Новая тренировка"
          >
            + Новая
          </button>
        )}
      </div>

      {/* Completed limit modal warning */}
      <Modal
        isOpen={showCompletedModal}
        onClose={() => setShowCompletedModal(false)}
        actions={[
          { label: 'Просмотр', onClick: () => setShowCompletedModal(false) },
          { label: '+ Новая тренировка', onClick: handleCreateNewTraining },
        ]}
      >
        <p className={s.dialogHeading}>Тренировка завершена</p>
        <p className={s.dialogInfo}>
          Выполнено {committedCount} из {limit ?? committedCount} выстрелов. Достигнут лимит серии.
        </p>
      </Modal>

      {/* Comment modal */}
      <Modal
        isOpen={commentModal !== null}
        onClose={() => setCommentModal(null)}
        actions={[
          { label: 'Отмена', onClick: () => setCommentModal(null) },
          {
            label: 'Сохранить',
            onClick: handleSaveComment,
            disabled: !commentText.trim() && !commentModal?.existingCommentId,
          },
        ]}
      >
        <p className={s.dialogInfo}>Замечание к выстрелу №{commentModal?.shotNumber}</p>
        <textarea
          className={s.commentTextarea}
          value={commentText}
          onChange={e => setCommentText(e.target.value)}
          rows={4}
          maxLength={1000}
          autoFocus
          placeholder="Введите замечание…"
        />
      </Modal>
    </div>
  );
}

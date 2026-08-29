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
  getTraining,
  shouldCompleteTrainingAfterShot,
} from '../domain/trainingRepo';
import TargetCanvas from '../components/TargetCanvas';
import ShotsList from '../components/ShotsList';
import { formatTrainingTotal } from './trainingTotal';
import { getSetting, setSetting } from '../db/settings';
import {
  getTrainingMode,
  getPp3SeriesBlocks,
  getPp3CurrentSeriesNumber,
  getPp3CanvasShots,
  resolvePp3ViewedSeriesNumber,
  isViewingPastPp3Series,
  getScopedRemarksLabel,
} from '../domain/trainingMode';
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
  full: '🔍 1-10',
  zoom7: '🔍 7-10',
  zoom9: '🔍 9-10',
};

interface Props {
  athlete: AthleteRecord;
  training: TrainingRecord;
  epoch: number;
  onBack: () => void;
  onNewTraining?: (newTraining: TrainingRecord) => void;
  onOpenGeneralRemark?: (training: TrainingRecord) => void;
  /** Opens the scoped «Замечания» screen for the current/selected series (see PLAN-SCOPED-REMARKS.md). */
  onOpenTrainingRemarks?: (training: TrainingRecord, seriesNumber: number | null) => void;
  /**
   * Set by App when returning from the general remark screen after the
   * coach used «Просмотр» to edit the last shot: re-shows the completion
   * overlay (with «Замечания») instead of dropping straight into review mode.
   */
  showCompletionOnMount?: boolean;
  /** Set by App when returning from the scoped remarks screen: restores the ПП-3 series that was being viewed. */
  restoreSeriesView?: number | null;
}

// Zoom modes in cyclical order — extend here to add intermediate zoom levels
const ZOOM_MODES: Array<'full' | 'zoom7' | 'zoom9'> = ['full', 'zoom7', 'zoom9'];

export default function TrainingScreen({ athlete, training, epoch, onBack, onNewTraining, onOpenGeneralRemark, onOpenTrainingRemarks, showCompletionOnMount, restoreSeriesView }: Props) {
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
  // Completed limit warning modal (also reachable again via the «Итоги» header
  // button after the coach dismissed it into review mode — see completedModalDismissed).
  const [showCompletedModal, setShowCompletedModal] = useState(false);
  const [completedModalDismissed, setCompletedModalDismissed] = useState(false);
  // "Начать новую" choice modal: "+ Новая серия" / "+ Новое упражнение"
  const [showNewChoiceModal, setShowNewChoiceModal] = useState(false);
  // ПП-3 series chip picked to view/edit; null falls back to the current series
  const [selectedSeriesView, setSelectedSeriesView] = useState<number | null>(restoreSeriesView ?? null);
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
      setSelectedSeriesView(restoreSeriesView ?? null);
      const db = await openDB();
      const zm = await getSetting(db, 'targetZoomMode');
      if (zm === 'zoom7' || zm === 'zoom9' || zm === 'full') setZoomMode(zm);
      setLoading(false);
      if (showCompletionOnMount && training.completedAt) {
        setShowCompletedModal(true);
        setCompletedModalDismissed(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training]);

  const lastShot = shots.length > 0 ? shots[shots.length - 1] : null;
  const targetShot = (selectedShotId ? shots.find(s => s.id === selectedShotId) : null) ?? lastShot;
  const committedCount = shots.filter(s => s.status === 'committed').length;

  const isCompleted = Boolean(currentTraining.completedAt);
  const isLimited = typeof currentTraining.targetShotCount === 'number' && currentTraining.targetShotCount > 0;
  const limit = currentTraining.targetShotCount ?? null;
  const mode = getTrainingMode(currentTraining);
  const committedShots = shots.filter(s => s.status === 'committed');
  // The series shown on the target lags behind committedCount on purpose:
  // it switches only once a shot (draft or committed) beyond the current
  // block's 10 actually appears, so the 10th shot of a block stays visible
  // and editable instead of vanishing the instant it is committed.
  const maxShotNumber = shots.length > 0 ? Math.max(...shots.map(s => s.shotNumber)) : 0;
  const pp3CurrentSeries = mode === 'pp3' ? getPp3CurrentSeriesNumber(maxShotNumber) : null;
  const pp3Blocks = mode === 'pp3' && pp3CurrentSeries !== null ? getPp3SeriesBlocks(committedShots, pp3CurrentSeries) : null;
  // ПП-3 shows one series at a time on the target: after each completed ten,
  // the visual target switches to the next block instead of accumulating all
  // 60 shots on a single screen (see PLAN-TRAINING-MODES.md §2). The overall
  // exercise stays one record — this only filters what TargetCanvas renders.
  const viewedSeries = mode === 'pp3' && pp3CurrentSeries !== null
    ? resolvePp3ViewedSeriesNumber(selectedSeriesView, pp3CurrentSeries)
    : null;
  const isViewingPastSeries = mode === 'pp3' && pp3CurrentSeries !== null
    && isViewingPastPp3Series(selectedSeriesView, pp3CurrentSeries);
  const canvasShots = (() => {
    if (mode !== 'pp3' || viewedSeries === null) return shots;
    return getPp3CanvasShots(shots, viewedSeries, isCompleted, selectedSeriesView);
  })();
  // Which series to scope the header's «Замечания» button/screen to: matches what
  // the target canvas is currently showing (see getPp3CanvasShots) — the
  // whole exercise once it's completed and no series chip is picked, or the
  // specific series being viewed otherwise.
  const remarksSeriesNumber = mode === 'pp3'
    ? (isCompleted && selectedSeriesView === null ? null : viewedSeries)
    : null;

  const headerProgressLabel = (() => {
    if (mode === 'series') return `Серия · ${committedCount}/${limit}`;
    if (mode === 'pp3') return `Серия ${pp3CurrentSeries}/6 · ${committedCount}/${limit}`;
    return isLimited ? `Выстрелы: ${committedCount} / ${limit}` : `Выстрелы: ${committedCount}`;
  })();

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
      // New shots always belong to the currently active series, never to a
      // completed series being viewed for editing (see PLAN-TRAINING-MODES.md).
      if (isViewingPastSeries) return;
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
      // Undo can move the current series boundary backwards; always fall
      // back to the (now updated) current series rather than keep viewing
      // a stale selection.
      setSelectedSeriesView(null);
      // Undo may reopen a training that was auto-completed by reaching its
      // limit (see deleteCommittedShotForUndo) — pick up the fresh record.
      const refreshedTraining = await getTraining(currentTraining.id);
      if (refreshedTraining) setCurrentTraining(refreshedTraining);
    } finally {
      setBusy(false);
    }
  };

  // Create new training for the current athlete
  const handleCreateNewTraining = async (targetShotCount: number) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    const newT = await createTraining(athlete.id, ep, targetShotCount);
    setShowCompletedModal(false);
    setShowNewChoiceModal(false);
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
        {isCompleted && completedModalDismissed && (
          <button
            type="button"
            className={s.back}
            onClick={() => setShowCompletedModal(true)}
          >
            Итоги
          </button>
        )}
        <span className={s.shotNum}>{headerProgressLabel}</span>
        {onOpenTrainingRemarks && (
          <button
            type="button"
            className={s.remarksBtn}
            onClick={() => onOpenTrainingRemarks(currentTraining, remarksSeriesNumber)}
          >
            {getScopedRemarksLabel(currentTraining, remarksSeriesNumber)}
          </button>
        )}
      </div>

      {/* Completed / ПП-3 progress banner (status only; the action lives in the fixed-width toolbar below) */}
      {(isCompleted || mode === 'pp3') && (
        <div className={s.completedBanner}>
          <span className={s.completedBannerText}>
            {isCompleted
              ? (mode === 'pp3' ? 'Упражнение ПП-3 завершено' : mode === 'series' ? 'Серия завершена' : 'Тренировка завершена')
              : `ПП-3 · Серия ${pp3CurrentSeries} из 6`}
          </span>
          {pp3Blocks && (
            <div className={s.seriesBlocksRow}>
              {pp3Blocks.map(b => {
                const isViewed = viewedSeries === b.index;
                const canView = b.committedCount > 0;
                const label = `${b.index}: ${b.committedCount}/10${b.committedCount === 10 ? ` · ${formatTrainingTotal(b.shots)}` : ''}`;
                return (
                  <button
                    key={b.index}
                    type="button"
                    className={`${s.seriesChip} ${b.isCurrent ? s.seriesChipCurrent : ''} ${isViewed && !b.isCurrent ? s.seriesChipViewed : ''}`}
                    disabled={!canView}
                    onClick={() => setSelectedSeriesView(b.isCurrent ? null : b.index)}
                    aria-pressed={isViewed}
                    aria-label={`Серия ${b.index}${isViewed ? ', просмотр' : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          {isViewingPastSeries && (
            <div className={s.viewingPastNotice}>
              <span>Просмотр серии {viewedSeries} (только редактирование)</span>
              <button type="button" className={s.returnToCurrentBtn} onClick={() => setSelectedSeriesView(null)}>
                К текущей серии
              </button>
            </div>
          )}
        </div>
      )}

      {/* Target + commit confirmation toast */}
      <div className={s.targetWrap}>
        <TargetCanvas
          shots={canvasShots}
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

      {/* Shot history (left column) + score + shot history (right column). For ПП-3
          these show only the currently viewed series (see canvasShots above), not
          every shot of the exercise — matching what TargetCanvas renders. */}
      <div className={s.shotsListWrapLeft}>
        <ShotsList shots={canvasShots} side="left" />
      </div>
      <div className={s.scoreDisplay}>{displayScore}</div>
      <div className={s.shotsListWrapRight}>
        <ShotsList shots={canvasShots} side="right" />
      </div>

      {/* Training total: whole-point sum and ISSF decimal sum, committed shots only */}
      <div className={s.totalsRow}>{formatTrainingTotal(shots)}</div>

      {/* Desktop-only sidebar: full ordered shot history with the total as its last row (see s.sidebarWrap, hidden on phone) */}
      <div className={s.sidebarWrap}>
        <div className={s.sidebarList}>
          <ShotsList shots={shots} side="all" />
        </div>
        <div className={s.sidebarTotalsRow}>{formatTrainingTotal(shots)}</div>
      </div>

      {/* Bottom toolbar: 3 fixed-width slots, zoom always centered.
          Left/right slots swap action by isCompleted so zoom never shifts position. */}
      <div className={s.toolbar}>
        {isCompleted ? (
          <button
            className={s.slotBtn}
            onClick={handleOpenComment}
            disabled={!targetShot}
            aria-label="Замечание к выстрелу"
          >
            Замечание
          </button>
        ) : (
          <button
            className={`${s.slotBtn} ${canUndo ? '' : s.disabled}`}
            onClick={handleUndo}
            disabled={!canUndo}
            aria-label="Отменить последний"
          >
            Отменить
          </button>
        )}
        <button
          className={s.slotBtn}
          onClick={toggleZoom}
          aria-label="Масштаб"
        >
          {ZOOM_LABELS[zoomMode]}
        </button>
        {isCompleted ? (
          <button
            className={`${s.slotBtn} ${s.slotBtnPrimary}`}
            onClick={() => setShowNewChoiceModal(true)}
            aria-label="Начать новую"
          >
            Начать новую
          </button>
        ) : (
          <button
            className={`${s.slotBtn} ${targetShot && dragging === null ? '' : s.disabled}`}
            onClick={handleOpenComment}
            disabled={!targetShot || dragging !== null}
            aria-label="Добавить замечание к выстрелу"
          >
            Замечание
          </button>
        )}
      </div>

      {/* Completed limit modal warning */}
      <Modal
        isOpen={showCompletedModal}
        onClose={() => { setShowCompletedModal(false); setCompletedModalDismissed(true); }}
        actions={[
          { label: 'Просмотр', onClick: () => { setShowCompletedModal(false); setCompletedModalDismissed(true); } },
          {
            label: 'Общее замечание',
            onClick: () => {
              setShowCompletedModal(false);
              setCompletedModalDismissed(true);
              onOpenGeneralRemark?.(currentTraining);
            },
          },
          { label: 'Начать новую', onClick: () => { setShowCompletedModal(false); setShowNewChoiceModal(true); } },
        ]}
      >
        <p className={s.dialogHeading}>{mode === 'pp3' ? 'упражнение ПП-3 завершено' : 'серия завершена'}</p>
        <p className={s.dialogInfo}>
          Выполнено {committedCount} из {limit ?? committedCount} выстрелов. Достигнут лимит серии.
        </p>
      </Modal>

      {/* "Начать новую" choice: two vertical actions per PLAN-TRAINING-MODES.md §1 */}
      <Modal
        isOpen={showNewChoiceModal}
        onClose={() => setShowNewChoiceModal(false)}
        actions={[{ label: 'Отмена', onClick: () => setShowNewChoiceModal(false) }]}
      >
        <p className={s.dialogHeading}>Начать новую</p>
        <div className={s.newChoiceActions}>
          <button className={s.newChoiceBtn} onClick={() => handleCreateNewTraining(10)}>+ Новая серия</button>
          <button className={s.newChoiceBtn} onClick={() => handleCreateNewTraining(60)}>+ Новое упражнение</button>
        </div>
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

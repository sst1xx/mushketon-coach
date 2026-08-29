import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, CommentRecord, GeneralCommentRecord, SeriesCommentRecord, ShotRecord, TrainingRecord } from '../db/schema';
import { listCommentsByTraining, updateComment, deleteComment } from '../domain/commentRepo';
import { getGeneralComment, deleteGeneralComment } from '../domain/generalCommentRepo';
import { listSeriesCommentsByTraining, deleteSeriesComment } from '../domain/seriesCommentRepo';
import { listShots } from '../domain/shotRepo';
import {
  getTrainingMode,
  getScopedRemarksLabel,
  getScopedRemarksShotNumberRange,
  getPp3SeriesShotGroups,
} from '../domain/trainingMode';
import { formatTrainingTotal } from './trainingTotal';
import Modal from '../components/Modal';
import s from './TrainingRemarksScreen.module.css';
import diaryStyles from './RemarksScreen.module.css';

interface Props {
  athlete: AthleteRecord;
  training: TrainingRecord;
  /** ПП-3 series being viewed on TrainingScreen, or `null` for the whole exercise/series. */
  seriesNumber: number | null;
  onBack: () => void;
  /**
   * Opens the remark editor. `targetSeriesNumber === null` edits the
   * exercise-wide (or standalone series') general comment; a number edits
   * that ПП-3 series' own independent comment (see PLAN-DIARY-IA.md §3/§6).
   */
  onOpenGeneralRemark: (training: TrainingRecord, targetSeriesNumber: number | null) => void;
  onOpenAllRemarks: () => void;
  /** Opens the target/mishень scoped to this series (see PLAN-DIARY-IA.md §8). */
  onOpenTarget: (training: TrainingRecord, seriesNumber: number | null) => void;
  /** Navigates from the whole-exercise diary into one series' own scoped diary. */
  onOpenSeriesDiary?: (training: TrainingRecord, seriesNumber: number) => void;
}

interface SeriesSummary {
  index: number;
  committedCount: number;
  resultLabel: string;
  /** This series' own independent general comment, distinct from the exercise-wide one. */
  seriesComment: SeriesCommentRecord | null;
  /** Shot-level comments for shots within this series' range, nested under it (see PLAN-DIARY-IA.md §9). */
  shotComments: CommentRecord[];
}

function formatShotLabel(shot: ShotRecord | undefined, shotNumber?: number): string {
  if (!shot) return shotNumber ? `Выстрел №${shotNumber}` : 'Выстрел удалён';
  const scoreLabel = shot.score > 0 ? (shot.score / 10).toFixed(1) : '0.0';
  return `Выстрел №${shot.shotNumber} • ${scoreLabel}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function TrainingRemarksScreen({
  athlete,
  training,
  seriesNumber,
  onBack,
  onOpenGeneralRemark,
  onOpenAllRemarks,
  onOpenTarget,
  onOpenSeriesDiary,
}: Props) {
  const mode = getTrainingMode(training);
  const title = getScopedRemarksLabel(training, seriesNumber);
  const isScopedPp3Series = mode === 'pp3' && seriesNumber !== null;
  const isWholePp3Exercise = mode === 'pp3' && seriesNumber === null;

  const [loading, setLoading] = useState(true);
  const [scopedShots, setScopedShots] = useState<ShotRecord[]>([]);
  const [scopedComments, setScopedComments] = useState<CommentRecord[]>([]);
  const [generalComment, setGeneralComment] = useState<GeneralCommentRecord | null>(null);
  const [seriesComment, setSeriesComment] = useState<SeriesCommentRecord | null>(null);
  const [seriesSummaries, setSeriesSummaries] = useState<SeriesSummary[]>([]);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<CommentRecord | null>(null);
  const [confirmDeleteGeneral, setConfirmDeleteGeneral] = useState(false);
  const [confirmDeleteSeries, setConfirmDeleteSeries] = useState(false);
  const [editTarget, setEditTarget] = useState<CommentRecord | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(async () => {
    const { start, end } = getScopedRemarksShotNumberRange(training, seriesNumber);
    const [allShots, allComments, general] = await Promise.all([
      listShots(training.id),
      listCommentsByTraining(training.id),
      getGeneralComment(training.id),
    ]);
    const inRange = allShots.filter(sh => sh.shotNumber >= start && sh.shotNumber <= end);
    const inRangeIds = new Set(inRange.map(sh => sh.id));
    setScopedShots(inRange);
    setScopedComments(allComments.filter(c => inRangeIds.has(c.shotId)));
    setGeneralComment(general ?? null);

    if (isScopedPp3Series) {
      const seriesComments = await listSeriesCommentsByTraining(training.id);
      setSeriesComment(seriesComments.find(sc => sc.seriesNumber === seriesNumber) ?? null);
    } else {
      setSeriesComment(null);
    }

    if (isWholePp3Exercise) {
      const seriesComments = await listSeriesCommentsByTraining(training.id);
      const seriesCommentBySeries = new Map(seriesComments.map(sc => [sc.seriesNumber, sc]));
      const summaries: SeriesSummary[] = getPp3SeriesShotGroups(allShots).map(({ index, shots: seriesShots }) => {
        const committed = seriesShots.filter(sh => sh.status === 'committed');
        const seriesShotIds = new Set(seriesShots.map(sh => sh.id));
        const shotComments = allComments
          .filter(c => seriesShotIds.has(c.shotId))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return {
          index,
          committedCount: committed.length,
          resultLabel: committed.length > 0 ? formatTrainingTotal(seriesShots) : 'Ещё нет выстрелов',
          seriesComment: seriesCommentBySeries.get(index) ?? null,
          shotComments,
        };
      });
      setSeriesSummaries(summaries);
    } else {
      setSeriesSummaries([]);
    }

    setLoading(false);
  }, [training, seriesNumber, isScopedPp3Series, isWholePp3Exercise]);

  useEffect(() => { load(); }, [load]);

  const committedInRange = scopedShots.filter(sh => sh.status === 'committed');
  const resultLabel = committedInRange.length > 0
    ? `${committedInRange.length} выстрелов · ${formatTrainingTotal(scopedShots)}`
    : 'Ещё нет выстрелов';

  const shotsById: Record<string, ShotRecord> = {};
  scopedShots.forEach(sh => { shotsById[sh.id] = sh; });

  const handleEditOpen = (c: CommentRecord) => {
    setEditTarget(c);
    setEditText(c.text);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    const trimmed = editText.trim();
    if (!trimmed) return;
    const db = await openDB();
    const ep = await readEpoch(db);
    await updateComment(editTarget.id, trimmed, ep);
    setEditTarget(null);
    await load();
  };

  const handleDeleteComment = async (c: CommentRecord) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteComment(c.id, ep);
    setConfirmDeleteComment(null);
    await load();
  };

  const handleDeleteGeneral = async () => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteGeneralComment(training.id, ep);
    setConfirmDeleteGeneral(false);
    await load();
  };

  const handleDeleteSeries = async () => {
    if (seriesNumber === null) return;
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteSeriesComment(training.id, seriesNumber, ep);
    setConfirmDeleteSeries(false);
    await load();
  };

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
      </div>
      <h2 className={s.title}>{title}</h2>
      <button
        type="button"
        className={s.metaLink}
        onClick={() => onOpenTarget(training, seriesNumber)}
      >
        {formatDate(training.startedAt)} · {resultLabel}
      </button>

      {generalComment ? (
        <div className={diaryStyles.generalComment}>
          <button
            type="button"
            className={diaryStyles.generalCommentBody}
            onClick={() => onOpenGeneralRemark(training, null)}
          >
            <span className={diaryStyles.generalCommentLabel}>
              {isScopedPp3Series ? 'Общее замечание по упражнению' : 'Общее замечание'}
            </span>
            <p className={diaryStyles.commentText}>{generalComment.text}</p>
          </button>
          <button
            type="button"
            className={diaryStyles.delBtn}
            onClick={() => setConfirmDeleteGeneral(true)}
            aria-label="Удалить общее замечание"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={diaryStyles.addGeneralComment}
          onClick={() => onOpenGeneralRemark(training, null)}
        >
          {isScopedPp3Series ? '+ Добавить общее замечание по упражнению' : '+ Добавить общее замечание'}
        </button>
      )}

      {isScopedPp3Series && (
        seriesComment ? (
          <div className={diaryStyles.generalComment}>
            <button
              type="button"
              className={diaryStyles.generalCommentBody}
              onClick={() => onOpenGeneralRemark(training, seriesNumber)}
            >
              <span className={diaryStyles.generalCommentLabel}>{`Общее замечание серии ${seriesNumber}`}</span>
              <p className={diaryStyles.commentText}>{seriesComment.text}</p>
            </button>
            <button
              type="button"
              className={diaryStyles.delBtn}
              onClick={() => setConfirmDeleteSeries(true)}
              aria-label="Удалить общее замечание серии"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={diaryStyles.addGeneralComment}
            onClick={() => onOpenGeneralRemark(training, seriesNumber)}
          >
            {`+ Добавить общее замечание серии ${seriesNumber}`}
          </button>
        )
      )}

      {!isWholePp3Exercise && scopedComments.length > 0 && (
        <ul className={diaryStyles.list}>
          {scopedComments.map(c => (
            <li key={c.id} className={diaryStyles.item}>
              <div className={diaryStyles.itemContent}>
                <p className={diaryStyles.commentText}>{c.text}</p>
                <p className={diaryStyles.commentMeta}>
                  {formatShotLabel(shotsById[c.shotId])} · {formatDate(c.createdAt)}
                </p>
              </div>
              <div className={diaryStyles.itemActions}>
                <button className={diaryStyles.editBtn} onClick={() => handleEditOpen(c)} aria-label="Редактировать">✎</button>
                <button className={diaryStyles.delBtn} onClick={() => setConfirmDeleteComment(c)} aria-label="Удалить">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {isWholePp3Exercise && (
        // Tree/nested layout (see PLAN-DIARY-IA.md §9): each series' own
        // general comment and its shots' comments are nested *inside* that
        // series' entry, never as a separate flat list above/after it.
        <ul className={s.seriesList}>
          {seriesSummaries.map(summary => (
            <li key={summary.index} className={s.seriesListItem}>
              <button
                type="button"
                className={s.seriesListBtn}
                onClick={() => onOpenSeriesDiary?.(training, summary.index)}
              >
                <span className={s.seriesListTitle}>Серия {summary.index}</span>
                <span className={s.seriesListMeta}>
                  {summary.committedCount} выстрелов · {summary.resultLabel}
                </span>
              </button>
              {summary.seriesComment ? (
                <div className={s.seriesNestedComment}>
                  <span className={diaryStyles.generalCommentLabel}>Общее замечание серии</span>
                  <p className={diaryStyles.commentText}>{summary.seriesComment.text}</p>
                </div>
              ) : (
                <span className={s.seriesListNotes}>Нет общего замечания</span>
              )}
              {summary.shotComments.length > 0 && (
                <ul className={s.seriesNestedList}>
                  {summary.shotComments.map(c => (
                    <li key={c.id} className={diaryStyles.item}>
                      <div className={diaryStyles.itemContent}>
                        <p className={diaryStyles.commentText}>{c.text}</p>
                        <p className={diaryStyles.commentMeta}>
                          {formatShotLabel(shotsById[c.shotId])} · {formatDate(c.createdAt)}
                        </p>
                      </div>
                      <div className={diaryStyles.itemActions}>
                        <button className={diaryStyles.editBtn} onClick={() => handleEditOpen(c)} aria-label="Редактировать">✎</button>
                        <button className={diaryStyles.delBtn} onClick={() => setConfirmDeleteComment(c)} aria-label="Удалить">✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <button type="button" className={s.openAllLink} onClick={onOpenAllRemarks}>
        Открыть все замечания
      </button>

      <Modal
        isOpen={editTarget !== null}
        title="Редактировать замечание"
        onClose={() => setEditTarget(null)}
        actions={[
          { label: 'Отмена', onClick: () => setEditTarget(null) },
          { label: 'Сохранить', onClick: handleEditSave, disabled: !editText.trim() },
        ]}
      >
        <textarea
          className={diaryStyles.textarea}
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={4}
          maxLength={1000}
          autoFocus
        />
      </Modal>

      <Modal
        isOpen={confirmDeleteComment !== null}
        onClose={() => setConfirmDeleteComment(null)}
        actions={[
          { label: 'Отмена', onClick: () => setConfirmDeleteComment(null) },
          { label: 'Удалить', danger: true, onClick: () => confirmDeleteComment && handleDeleteComment(confirmDeleteComment) },
        ]}
      >
        <p>Удалить замечание?</p>
        <p className={diaryStyles.warn}>Это действие нельзя отменить.</p>
      </Modal>

      <Modal
        isOpen={confirmDeleteGeneral}
        onClose={() => setConfirmDeleteGeneral(false)}
        actions={[
          { label: 'Отмена', onClick: () => setConfirmDeleteGeneral(false) },
          { label: 'Удалить', danger: true, onClick: handleDeleteGeneral },
        ]}
      >
        <p>Удалить общее замечание?</p>
        <p className={diaryStyles.warn}>Это действие нельзя отменить.</p>
      </Modal>

      <Modal
        isOpen={confirmDeleteSeries}
        onClose={() => setConfirmDeleteSeries(false)}
        actions={[
          { label: 'Отмена', onClick: () => setConfirmDeleteSeries(false) },
          { label: 'Удалить', danger: true, onClick: handleDeleteSeries },
        ]}
      >
        <p>Удалить общее замечание серии?</p>
        <p className={diaryStyles.warn}>Это действие нельзя отменить.</p>
      </Modal>
    </div>
  );
}

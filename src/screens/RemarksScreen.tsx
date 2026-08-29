import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, CommentRecord, GeneralCommentRecord, SeriesCommentRecord, ShotRecord, TrainingRecord } from '../db/schema';
import {
  listCommentsByAthlete,
  updateComment,
  deleteComment,
} from '../domain/commentRepo';
import { listGeneralCommentsByAthlete, deleteGeneralComment } from '../domain/generalCommentRepo';
import { listSeriesCommentsByAthlete } from '../domain/seriesCommentRepo';
import { getShot, listShots } from '../domain/shotRepo';
import { listTrainings } from '../domain/trainingRepo';
import { getTrainingMode, getPp3SeriesShotGroups } from '../domain/trainingMode';
import { formatTrainingTotal } from './trainingTotal';
import Modal from '../components/Modal';
import s from './RemarksScreen.module.css';

interface Props {
  athlete: AthleteRecord;
  epoch: number;
  onBack: () => void;
  /** Opens this training's own scoped diary (Дневник · Тренировка), see PLAN-DIARY-IA.md §5/§8. */
  onSelectTraining: (training: TrainingRecord, focusShotNumber?: number) => void;
  onOpenGeneralRemark: (training: TrainingRecord) => void;
  /** Opens the scoped diary of one ПП-3 series directly from its row in an exercise entry. */
  onOpenSeriesDiary?: (training: TrainingRecord, seriesNumber: number) => void;
}

interface Pp3SeriesRow {
  index: number;
  committedCount: number;
  resultLabel: string;
  /** This series' own independent general comment (distinct from the exercise-wide one). */
  seriesComment: SeriesCommentRecord | null;
  /** Shot-level comments nested under this series, never shown as a separate flat list (see PLAN-DIARY-IA.md §9). */
  shotComments: CommentRecord[];
}

interface TrainingEntry {
  training: TrainingRecord;
  generalComment: GeneralCommentRecord | null;
  shotComments: CommentRecord[];
  resultLabel: string;
  pp3Series: Pp3SeriesRow[];
}

function formatShotLabel(shot: ShotRecord | undefined): string {
  if (!shot) return 'Выстрел удалён';
  const scoreLabel = shot.score > 0 ? (shot.score / 10).toFixed(1) : '0.0';
  return `Выстрел №${shot.shotNumber} • ${scoreLabel}`;
}

function trainingLabel(training: TrainingRecord): string {
  const mode = getTrainingMode(training);
  if (mode === 'pp3') return 'Упражнение';
  if (mode === 'series') return 'Серия';
  return 'Тренировка';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function RemarksScreen({ athlete, epoch, onBack, onSelectTraining, onOpenGeneralRemark, onOpenSeriesDiary }: Props) {
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [shotsById, setShotsById] = useState<Record<string, ShotRecord | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<CommentRecord | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<CommentRecord | null>(null);
  const [confirmDeleteGeneral, setConfirmDeleteGeneral] = useState<TrainingRecord | null>(null);

  const load = useCallback(async () => {
    const [trainings, shotComments, generalComments, seriesComments] = await Promise.all([
      listTrainings(athlete.id),
      listCommentsByAthlete(athlete.id),
      listGeneralCommentsByAthlete(athlete.id),
      listSeriesCommentsByAthlete(athlete.id),
    ]);

    const generalByTraining = new Map(generalComments.map(gc => [gc.trainingId, gc]));
    const shotCommentsByTraining = new Map<string, CommentRecord[]>();
    for (const c of shotComments) {
      const arr = shotCommentsByTraining.get(c.trainingId) ?? [];
      arr.push(c);
      shotCommentsByTraining.set(c.trainingId, arr);
    }
    const seriesCommentsByTraining = new Map<string, SeriesCommentRecord[]>();
    for (const sc of seriesComments) {
      const arr = seriesCommentsByTraining.get(sc.trainingId) ?? [];
      arr.push(sc);
      seriesCommentsByTraining.set(sc.trainingId, arr);
    }

    const filteredTrainings = trainings.filter(training => {
      const generalComment = generalByTraining.get(training.id) ?? null;
      const shotComments = shotCommentsByTraining.get(training.id) ?? [];
      const hasSeriesComments = (seriesCommentsByTraining.get(training.id) ?? []).length > 0;
      return generalComment !== null || shotComments.length > 0 || hasSeriesComments || training.completedAt !== null;
    });

    const shotsPerTraining = await Promise.all(filteredTrainings.map(training => listShots(training.id)));

    const list: TrainingEntry[] = filteredTrainings
      .map((training, i) => {
        const shots = shotsPerTraining[i];
        const committedCount = shots.filter(sh => sh.status === 'committed').length;
        const trainingShotComments = shotCommentsByTraining.get(training.id) ?? [];
        const trainingSeriesComments = seriesCommentsByTraining.get(training.id) ?? [];
        const seriesCommentBySeries = new Map(trainingSeriesComments.map(sc => [sc.seriesNumber, sc]));

        const mode = getTrainingMode(training);
        const pp3Series: Pp3SeriesRow[] = mode === 'pp3'
          ? getPp3SeriesShotGroups(shots).map(({ index, shots: seriesShots }) => {
            const committed = seriesShots.filter(sh => sh.status === 'committed');
            const seriesShotIds = new Set(seriesShots.map(sh => sh.id));
            const seriesShotComments = trainingShotComments
              .filter(c => seriesShotIds.has(c.shotId))
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return {
              index,
              committedCount: committed.length,
              resultLabel: committed.length > 0 ? formatTrainingTotal(seriesShots) : 'Ещё нет выстрелов',
              seriesComment: seriesCommentBySeries.get(index) ?? null,
              shotComments: seriesShotComments,
            };
          }).filter(row => row.committedCount > 0 || row.seriesComment !== null || row.shotComments.length > 0)
          : [];

        return {
          training,
          generalComment: generalByTraining.get(training.id) ?? null,
          shotComments: trainingShotComments
            .slice()
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
          resultLabel: `${committedCount} выстрелов · ${formatTrainingTotal(shots)}`,
          pp3Series,
        };
      })
      .sort((a, b) => new Date(b.training.startedAt).getTime() - new Date(a.training.startedAt).getTime());

    setEntries(list);

    const uniqueShotIds = Array.from(new Set(shotComments.map(c => c.shotId)));
    const shots = await Promise.all(uniqueShotIds.map(id => getShot(id)));
    const map: Record<string, ShotRecord | undefined> = {};
    uniqueShotIds.forEach((id, i) => { map[id] = shots[i]; });
    setShotsById(map);
    setLoading(false);
  }, [athlete.id]);

  useEffect(() => { load(); }, [load]);

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

  const handleShotClick = async (shot: ShotRecord) => {
    const training = await getShotTraining(shot);
    if (training) onSelectTraining(training, shot.shotNumber);
  };

  const getShotTraining = async (shot: ShotRecord): Promise<TrainingRecord | undefined> => {
    const entry = entries.find(e => e.training.id === shot.trainingId);
    return entry?.training;
  };

  const handleDelete = async (c: CommentRecord) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteComment(c.id, ep);
    setConfirmDelete(null);
    await load();
  };

  const handleDeleteGeneral = async (training: TrainingRecord) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteGeneralComment(training.id, ep);
    setConfirmDeleteGeneral(null);
    await load();
  };

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
      </div>
      <h2 className={s.title}>Дневник</h2>

      {entries.length === 0 ? (
        <p className={s.empty}>Нет замечаний</p>
      ) : (
        <ul className={s.diary}>
          {entries.map(entry => (
            <li key={entry.training.id} className={s.diaryEntry}>
              <div className={s.diaryEntryHeader}>
                <span className={s.diaryDate}>{formatDate(entry.training.startedAt)}</span>
                <button
                  type="button"
                  className={s.diaryType}
                  onClick={() => onSelectTraining(entry.training)}
                >
                  {trainingLabel(entry.training)}
                </button>
                <span className={s.diaryResult}>{entry.resultLabel}</span>
              </div>

              {entry.generalComment ? (
                <div className={s.generalComment}>
                  <button
                    type="button"
                    className={s.generalCommentBody}
                    onClick={() => onOpenGeneralRemark(entry.training)}
                  >
                    <span className={s.generalCommentLabel}>Общее замечание</span>
                    <p className={s.commentText}>{entry.generalComment.text}</p>
                  </button>
                  <button
                    type="button"
                    className={s.delBtn}
                    onClick={() => setConfirmDeleteGeneral(entry.training)}
                    aria-label="Удалить общее замечание"
                  >
                    ✕
                  </button>
                </div>
              ) : entry.training.completedAt !== null ? (
                <button
                  type="button"
                  className={s.addGeneralComment}
                  onClick={() => onOpenGeneralRemark(entry.training)}
                >
                  + Добавить общее замечание
                </button>
              ) : null}

              {(entry.pp3Series ?? []).length > 0 ? (
                // Tree/nested layout (see PLAN-DIARY-IA.md §9): each series'
                // own comment and its shots' comments are nested *inside*
                // that series' entry — never as a separate flat list.
                <ul className={s.pp3SeriesList}>
                  {entry.pp3Series.map(row => (
                    <li key={row.index}>
                      <button
                        type="button"
                        className={s.pp3SeriesRow}
                        onClick={() => onOpenSeriesDiary?.(entry.training, row.index)}
                      >
                        <span className={s.pp3SeriesTitle}>Серия {row.index}</span>
                        <span className={s.pp3SeriesMeta}>
                          {row.committedCount} выстрелов · {row.resultLabel}
                        </span>
                      </button>
                      {row.seriesComment ? (
                        <div className={s.pp3SeriesComment}>
                          <span className={s.generalCommentLabel}>Общее замечание серии</span>
                          <p className={s.commentText}>{row.seriesComment.text}</p>
                        </div>
                      ) : (
                        <span className={s.pp3SeriesNotes}>Нет общего замечания</span>
                      )}
                      {row.shotComments.length > 0 && (
                        <ul className={s.pp3SeriesShotList}>
                          {row.shotComments.map(c => (
                            <li key={c.id} className={s.item}>
                              <div className={s.itemContent}>
                                <p className={s.commentText}>{c.text}</p>
                                {shotsById[c.shotId] ? (
                                  <button
                                    type="button"
                                    className={s.shotLink}
                                    onClick={() => handleShotClick(shotsById[c.shotId]!)}
                                  >
                                    {formatShotLabel(shotsById[c.shotId])} · {formatDate(c.createdAt)}
                                  </button>
                                ) : (
                                  <p className={s.commentMeta}>
                                    {formatShotLabel(shotsById[c.shotId])} · {formatDate(c.createdAt)}
                                  </p>
                                )}
                              </div>
                              <div className={s.itemActions}>
                                <button className={s.editBtn} onClick={() => handleEditOpen(c)} aria-label="Редактировать">✎</button>
                                <button className={s.delBtn} onClick={() => setConfirmDelete(c)} aria-label="Удалить">✕</button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              ) : entry.shotComments.length > 0 && (
                <ul className={s.list}>
                  {entry.shotComments.map(c => (
                    <li key={c.id} className={s.item}>
                      <div className={s.itemContent}>
                        <p className={s.commentText}>{c.text}</p>
                        {shotsById[c.shotId] ? (
                          <button
                            type="button"
                            className={s.shotLink}
                            onClick={() => handleShotClick(shotsById[c.shotId]!)}
                          >
                            {formatShotLabel(shotsById[c.shotId])} · {formatDate(c.createdAt)}
                          </button>
                        ) : (
                          <p className={s.commentMeta}>
                            {formatShotLabel(shotsById[c.shotId])} · {formatDate(c.createdAt)}
                          </p>
                        )}
                      </div>
                      <div className={s.itemActions}>
                        <button className={s.editBtn} onClick={() => handleEditOpen(c)} aria-label="Редактировать">✎</button>
                        <button className={s.delBtn} onClick={() => setConfirmDelete(c)} aria-label="Удалить">✕</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

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
          className={s.textarea}
          value={editText}
          onChange={e => setEditText(e.target.value)}
          rows={4}
          maxLength={1000}
          autoFocus
        />
      </Modal>

      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        actions={[
          { label: 'Отмена', onClick: () => setConfirmDelete(null) },
          { label: 'Удалить', danger: true, onClick: () => confirmDelete && handleDelete(confirmDelete) },
        ]}
      >
        <p>Удалить замечание?</p>
        <p className={s.warn}>Это действие нельзя отменить.</p>
      </Modal>

      <Modal
        isOpen={confirmDeleteGeneral !== null}
        onClose={() => setConfirmDeleteGeneral(null)}
        actions={[
          { label: 'Отмена', onClick: () => setConfirmDeleteGeneral(null) },
          { label: 'Удалить', danger: true, onClick: () => confirmDeleteGeneral && handleDeleteGeneral(confirmDeleteGeneral) },
        ]}
      >
        <p>Удалить общее замечание?</p>
        <p className={s.warn}>Это действие нельзя отменить.</p>
      </Modal>
    </div>
  );
}

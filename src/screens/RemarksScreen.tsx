import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, CommentRecord, GeneralCommentRecord, SeriesCommentRecord, ShotRecord, TrainingRecord } from '../db/schema';
import {
  listCommentsByAthlete,
  deleteComment,
} from '../domain/commentRepo';
import { listGeneralCommentsByAthlete, deleteGeneralComment } from '../domain/generalCommentRepo';
import { listSeriesCommentsByAthlete, deleteSeriesComment } from '../domain/seriesCommentRepo';
import { getShot, listShots } from '../domain/shotRepo';
import { listTrainings } from '../domain/trainingRepo';
import { getTrainingMode, getPp3SeriesShotGroups } from '../domain/trainingMode';
import { formatTrainingTotal } from './trainingTotal';
import Modal from '../components/Modal';
import { RemarkRow, RemarkRowEmpty } from '../components/RemarkRow';
import s from './RemarksScreen.module.css';

interface Props {
  athlete: AthleteRecord;
  epoch: number;
  onBack: () => void;
  /** Opens this training's own scoped diary (Дневник · Тренировка), see PLAN-DIARY-IA.md §5/§8. */
  onSelectTraining: (training: TrainingRecord, focusShotNumber?: number) => void;
  /** `seriesNumber` is `null` for the exercise-wide/standalone-series comment, a number for one ПП-3 series' own comment. */
  onOpenGeneralRemark: (training: TrainingRecord, seriesNumber?: number | null) => void;
  /** Opens the scoped diary of one ПП-3 series directly from its row in an exercise entry. */
  onOpenSeriesDiary?: (training: TrainingRecord, seriesNumber: number) => void;
  /** Opens the full-screen editor for an existing shot comment (see PLAN-DIARY-AFFORDANCE.md §2). */
  onEditShotComment: (comment: CommentRecord, shot: ShotRecord | undefined) => void;
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

export default function RemarksScreen({ athlete, epoch, onBack, onSelectTraining, onOpenGeneralRemark, onOpenSeriesDiary, onEditShotComment }: Props) {
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [shotsById, setShotsById] = useState<Record<string, ShotRecord | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<CommentRecord | null>(null);
  const [confirmDeleteGeneral, setConfirmDeleteGeneral] = useState<TrainingRecord | null>(null);
  const [confirmDeleteSeries, setConfirmDeleteSeries] = useState<{ training: TrainingRecord; seriesNumber: number } | null>(null);

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

  const handleShotClick = (shot: ShotRecord) => {
    const entry = entries.find(e => e.training.id === shot.trainingId);
    if (entry) onSelectTraining(entry.training, shot.shotNumber);
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

  const handleDeleteSeries = async () => {
    if (!confirmDeleteSeries) return;
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteSeriesComment(confirmDeleteSeries.training.id, confirmDeleteSeries.seriesNumber, ep);
    setConfirmDeleteSeries(null);
    await load();
  };

  const renderShotCommentRow = (c: CommentRecord, nested: boolean) => {
    const shot = shotsById[c.shotId];
    return (
      <RemarkRow
        key={c.id}
        text={c.text}
        metaLabel={`${formatShotLabel(shot)} · ${formatDate(c.createdAt)}`}
        onOpenMeta={shot ? () => handleShotClick(shot) : undefined}
        onOpenEditor={() => onEditShotComment(c, shot)}
        onEdit={() => onEditShotComment(c, shot)}
        onDelete={() => setConfirmDelete(c)}
        nested={nested}
      />
    );
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
                <RemarkRow
                  label="Общее замечание"
                  text={entry.generalComment.text}
                  onOpenEditor={() => onOpenGeneralRemark(entry.training)}
                  onEdit={() => onOpenGeneralRemark(entry.training)}
                  onDelete={() => setConfirmDeleteGeneral(entry.training)}
                />
              ) : entry.training.completedAt !== null ? (
                <RemarkRowEmpty
                  addLabel="+ Добавить общее замечание"
                  onAdd={() => onOpenGeneralRemark(entry.training)}
                />
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
                        <RemarkRow
                          label={`Общее замечание серии ${row.index}`}
                          text={row.seriesComment.text}
                          onOpenEditor={() => onOpenGeneralRemark(entry.training, row.index)}
                          onEdit={() => onOpenGeneralRemark(entry.training, row.index)}
                          onDelete={() => setConfirmDeleteSeries({ training: entry.training, seriesNumber: row.index })}
                          nested
                        />
                      ) : (
                        <RemarkRowEmpty
                          addLabel={`+ Добавить общее замечание серии ${row.index}`}
                          onAdd={() => onOpenGeneralRemark(entry.training, row.index)}
                          nested
                        />
                      )}
                      {row.shotComments.length > 0 && (
                        <div className={s.pp3SeriesShotList}>
                          {row.shotComments.map(c => renderShotCommentRow(c, true))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : entry.shotComments.length > 0 && (
                <div>
                  {entry.shotComments.map(c => renderShotCommentRow(c, false))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

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

      <Modal
        isOpen={confirmDeleteSeries !== null}
        onClose={() => setConfirmDeleteSeries(null)}
        actions={[
          { label: 'Отмена', onClick: () => setConfirmDeleteSeries(null) },
          { label: 'Удалить', danger: true, onClick: handleDeleteSeries },
        ]}
      >
        <p>Удалить общее замечание серии?</p>
        <p className={s.warn}>Это действие нельзя отменить.</p>
      </Modal>
    </div>
  );
}

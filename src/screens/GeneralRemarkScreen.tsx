import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, TrainingRecord } from '../db/schema';
import { listShots } from '../domain/shotRepo';
import { getGeneralComment, saveGeneralComment } from '../domain/generalCommentRepo';
import { getSeriesComment, saveSeriesComment } from '../domain/seriesCommentRepo';
import { getTrainingMode, getPp3SeriesShotNumberRange } from '../domain/trainingMode';
import { formatTrainingTotal } from './trainingTotal';
import s from './GeneralRemarkScreen.module.css';

interface Props {
  athlete: AthleteRecord;
  training: TrainingRecord;
  /**
   * When set on a ПП-3 exercise, this editor works with that series' own
   * independent comment (SeriesCommentRecord) instead of the exercise-wide
   * one (GeneralCommentRecord) — see PLAN-DIARY-IA.md §3/§6.
   */
  seriesNumber?: number | null;
  onBack: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function GeneralRemarkScreen({ athlete, training, seriesNumber = null, onBack }: Props) {
  const mode = getTrainingMode(training);
  const isSeriesLevel = mode === 'pp3' && seriesNumber !== null;
  const title = isSeriesLevel
    ? `Общее замечание серии ${seriesNumber}`
    : mode === 'pp3'
      ? 'Общее замечание упражнения'
      : mode === 'series'
        ? 'Общее замечание серии'
        : 'Общее замечание';

  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [summary, setSummary] = useState<{ count: number; total: string } | null>(null);

  const load = useCallback(async () => {
    const shots = await listShots(training.id);
    const scopedShots = isSeriesLevel
      ? (() => {
          const { start, end } = getPp3SeriesShotNumberRange(seriesNumber!);
          return shots.filter(sh => sh.shotNumber >= start && sh.shotNumber <= end);
        })()
      : shots;
    const committed = scopedShots.filter(sh => sh.status === 'committed');
    setSummary({ count: committed.length, total: formatTrainingTotal(scopedShots) });
    const existing = isSeriesLevel
      ? await getSeriesComment(training.id, seriesNumber!)
      : await getGeneralComment(training.id);
    setText(existing ? existing.text : '');
    setLoading(false);
  }, [training.id, isSeriesLevel, seriesNumber]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    const db = await openDB();
    const ep = await readEpoch(db);
    if (isSeriesLevel) {
      await saveSeriesComment({ athleteId: athlete.id, trainingId: training.id, seriesNumber: seriesNumber!, text }, ep);
    } else {
      await saveGeneralComment({ athleteId: athlete.id, trainingId: training.id, text }, ep);
    }
    onBack();
  };

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
      </div>
      <h2 className={s.title}>{title}</h2>
      <p className={s.meta}>{formatDate(training.startedAt)}</p>
      {summary && (
        <p className={s.meta}>{summary.count} выстрелов · {summary.total}</p>
      )}
      <textarea
        className={s.textarea}
        value={text}
        onChange={e => setText(e.target.value)}
        rows={8}
        maxLength={1000}
        autoFocus
        placeholder="Введите общее замечание…"
      />
      <div className={s.actions}>
        <button className={s.cancelBtn} onClick={onBack}>Отмена</button>
        <button className={s.saveBtn} onClick={handleSave} disabled={!text.trim()}>Сохранить</button>
      </div>
    </div>
  );
}

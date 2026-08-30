import React, { useState } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, CommentRecord, ShotRecord } from '../db/schema';
import { updateComment } from '../domain/commentRepo';
import s from './ShotRemarkEditorScreen.module.css';

interface Props {
  athlete: AthleteRecord;
  comment: CommentRecord;
  /** May be missing if the shot was later deleted; the label degrades gracefully. */
  shot: ShotRecord | undefined;
  onBack: () => void;
}

function formatShotLabel(shot: ShotRecord | undefined): string {
  if (!shot) return 'Выстрел удалён';
  const scoreLabel = shot.score > 0 ? (shot.score / 10).toFixed(1) : '0.0';
  return `Выстрел №${shot.shotNumber} • ${scoreLabel}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Full-screen editor for an existing shot comment, opened from the diary
 * (RemarksScreen / TrainingRemarksScreen) — see PLAN-DIARY-AFFORDANCE.md §2.
 * Shot comments are still created only from the target screen
 * (TrainingScreen); this screen only edits an already-existing record.
 */
export default function ShotRemarkEditorScreen({ athlete, comment, shot, onBack }: Props) {
  const [text, setText] = useState(comment.text);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const db = await openDB();
    const ep = await readEpoch(db);
    await updateComment(comment.id, trimmed, ep);
    onBack();
  };

  return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
      </div>
      <h2 className={s.title}>Замечание к выстрелу</h2>
      <p className={s.meta}>{formatShotLabel(shot)} · {formatDate(comment.createdAt)}</p>
      <textarea
        className={s.textarea}
        value={text}
        onChange={e => setText(e.target.value)}
        rows={8}
        maxLength={1000}
        autoFocus
      />
      <div className={s.actions}>
        <button className={s.cancelBtn} onClick={onBack}>Отмена</button>
        <button className={s.saveBtn} onClick={handleSave} disabled={!text.trim()}>Сохранить</button>
      </div>
    </div>
  );
}

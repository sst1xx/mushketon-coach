import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, CommentRecord } from '../db/schema';
import {
  listCommentsByAthlete,
  updateComment,
  deleteComment,
} from '../domain/commentRepo';
import Modal from '../components/Modal';
import s from './RemarksScreen.module.css';

interface Props {
  athlete: AthleteRecord;
  epoch: number;
  onBack: () => void;
}

export default function RemarksScreen({ athlete, epoch, onBack }: Props) {
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<CommentRecord | null>(null);
  const [editText, setEditText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<CommentRecord | null>(null);

  const load = useCallback(async () => {
    setComments(await listCommentsByAthlete(athlete.id));
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

  const handleDelete = async (c: CommentRecord) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteComment(c.id, ep);
    setConfirmDelete(null);
    await load();
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.athleteName}>{athlete.name}</span>
      </div>
      <h2 className={s.title}>Замечания</h2>

      {comments.length === 0 ? (
        <p className={s.empty}>Нет замечаний</p>
      ) : (
        <ul className={s.list}>
          {comments.map(c => (
            <li key={c.id} className={s.item}>
              <div className={s.itemContent}>
                <p className={s.commentText}>{c.text}</p>
                <p className={s.commentMeta}>{formatDate(c.createdAt)}</p>
              </div>
              <div className={s.itemActions}>
                <button className={s.editBtn} onClick={() => handleEditOpen(c)} aria-label="Редактировать">✎</button>
                <button className={s.delBtn} onClick={() => setConfirmDelete(c)} aria-label="Удалить">✕</button>
              </div>
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
    </div>
  );
}

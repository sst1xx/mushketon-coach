import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, CommentRecord } from '../db/schema';
import {
  listCommentsByAthlete,
  updateComment,
  deleteComment,
} from '../domain/commentRepo';

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

  if (loading) return <div style={s.page}><p>Загрузка…</p></div>;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.back} onClick={onBack}>◀ Назад</button>
        <span style={s.athleteName}>{athlete.name}</span>
      </div>
      <h2 style={s.title}>Замечания</h2>

      {comments.length === 0 ? (
        <p style={s.empty}>Нет замечаний</p>
      ) : (
        <ul style={s.list}>
          {comments.map(c => (
            <li key={c.id} style={s.item}>
              <div style={s.itemContent}>
                <p style={s.commentText}>{c.text}</p>
                <p style={s.commentMeta}>{formatDate(c.createdAt)}</p>
              </div>
              <div style={s.itemActions}>
                <button style={s.editBtn} onClick={() => handleEditOpen(c)}>✎</button>
                <button style={s.delBtn} onClick={() => setConfirmDelete(c)}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <p style={s.dialogTitle}>Редактировать замечание</p>
            <textarea
              style={s.textarea}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              rows={4}
              maxLength={1000}
              autoFocus
            />
            <div style={s.dialogBtns}>
              <button style={s.btnGhost} onClick={() => setEditTarget(null)}>Отмена</button>
              <button
                style={{ ...s.btn, opacity: editText.trim() ? 1 : 0.5 }}
                onClick={handleEditSave}
                disabled={!editText.trim()}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <p>Удалить замечание?</p>
            <p style={s.warn}>Это действие нельзя отменить.</p>
            <div style={s.dialogBtns}>
              <button style={s.btnGhost} onClick={() => setConfirmDelete(null)}>Отмена</button>
              <button style={s.btnDanger} onClick={() => handleDelete(confirmDelete)}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px', fontFamily: 'sans-serif' },
  header:       { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  back:         { background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', color: '#1a1a2e', padding: '4px 0' },
  athleteName:  { fontSize: 17, fontWeight: 600 },
  title:        { fontSize: 22, margin: '0 0 16px' },
  empty:        { color: '#888', fontSize: 15 },
  list:         { listStyle: 'none', padding: 0, margin: 0 },
  item:         { display: 'flex', alignItems: 'flex-start', gap: 8, borderBottom: '1px solid #eee', padding: '10px 0' },
  itemContent:  { flex: 1, minWidth: 0 },
  commentText:  { margin: '0 0 4px', fontSize: 15, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  commentMeta:  { margin: 0, fontSize: 12, color: '#999' },
  itemActions:  { display: 'flex', gap: 4, flexShrink: 0 },
  editBtn:      { background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer', padding: '0 4px' },
  delBtn:       { background: 'none', border: 'none', color: '#999', fontSize: 18, cursor: 'pointer', padding: '0 4px' },
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog:       { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 360, width: '90%' },
  dialogTitle:  { fontWeight: 600, fontSize: 16, margin: '0 0 12px' },
  textarea:     { width: '100%', fontSize: 15, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'sans-serif' },
  dialogBtns:   { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 },
  btn:          { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
  btnGhost:     { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  btnDanger:    { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#c0392b', color: '#fff', cursor: 'pointer' },
  warn:         { color: '#888', fontSize: 14, margin: '4px 0' },
};

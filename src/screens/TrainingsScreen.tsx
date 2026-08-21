import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, TrainingRecord } from '../db/schema';
import { createTraining, listTrainings, deleteTraining } from '../domain/trainingRepo';

interface Props {
  athlete: AthleteRecord;
  epoch: number;
  onBack: () => void;
  onSelectTraining: (t: TrainingRecord) => void;
  onOpenRemarks?: () => void;
}

export default function TrainingsScreen({ athlete, epoch, onBack, onSelectTraining, onOpenRemarks }: Props) {
  const [trainings, setTrainings] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<TrainingRecord | null>(null);

  const load = useCallback(async () => {
    setTrainings(await listTrainings(athlete.id));
    setLoading(false);
   }, [athlete.id]);

  useEffect(() => { load(); }, [load]);

  const handleNew = async () => {
    const db = await openDB();
    const ep = await readEpoch(db);
    const newTraining = await createTraining(athlete.id, ep);
    onSelectTraining(newTraining);
   };

  const handleDelete = async (t: TrainingRecord) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteTraining(t.id, ep);
    setConfirmDelete(null);
    await load();
   };

  const formatDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  if (loading) return <div style={s.page}><p>Загрузка…</p></div>;

  return (
     <div style={s.page}>
       <div style={s.header}>
         <button style={s.back} onClick={onBack}>◀ Назад</button>
         <span style={s.athleteName}>{athlete.name}</span>
         {onOpenRemarks && (
           <button style={s.remarksBtn} onClick={onOpenRemarks}>Замечания</button>
         )}
       </div>
       <h2 style={s.title}>Тренировки</h2>

       <ul style={s.list}>
         {trainings.map(t => (
           <li key={t.id} style={s.item}>
             <button style={s.itemTap} onClick={() => onSelectTraining(t)}>
               <div style={s.itemMain}>
                 <span style={s.date}>{formatDate(t.startedAt)}</span>
                 {t.completedAt && <span style={s.badge}>Завершена</span>}
               </div>
             </button>
             <div style={s.itemActions}>
               <button style={s.delBtn} onClick={() => setConfirmDelete(t)}>✕</button>
             </div>
           </li>
         ))}
       </ul>

       <button style={s.addBtn} onClick={handleNew}>+ Новая тренировка</button>

       {confirmDelete && (
         <div style={s.overlay}>
           <div style={s.dialog}>
             <p>Удалить тренировку от <strong>{formatDate(confirmDelete.startedAt)}</strong>?</p>
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
   page:        { maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px', fontFamily: 'sans-serif' },
  header:      { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 },
  back:         { background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', color: '#1a1a2e', padding: '4px 0' },
  athleteName: { fontSize: 17, fontWeight: 600, flex: 1 },
  remarksBtn:  { background: 'none', border: '1px solid #ccc', borderRadius: 6, fontSize: 13, padding: '4px 10px', cursor: 'pointer', color: '#1a1a2e' },
  title:        { fontSize: 22, margin: '0 0 16px' },
  list:         { listStyle: 'none', padding: 0, margin: '0 0 16px' },
  item:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee', padding: '10px 0' },
  itemMain:     { display: 'flex', alignItems: 'center', gap: 8 },
  itemTap:      { background: 'none', border: 'none', padding: 0, cursor: 'pointer', flex: 1, textAlign: 'left' },
  itemActions:  { display: 'flex', alignItems: 'center', gap: 4 },
  date:         { fontSize: 16 },
  badge:        { fontSize: 12, background: '#27ae60', color: '#fff', borderRadius: 4, padding: '2px 6px' },
  btnSmall:     { fontSize: 13, padding: '4px 10px', borderRadius: 5, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  delBtn:       { background: 'none', border: 'none', color: '#999', fontSize: 18, cursor: 'pointer', padding: '0 4px' },
  addBtn:       { width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '2px dashed #ccc', background: 'none', cursor: 'pointer', color: '#555' },
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog:       { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 320, width: '90%' },
  dialogBtns:   { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 },
  warn:         { color: '#888', fontSize: 14 },
  btn:          { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
  btnGhost:     { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  btnDanger:    { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#c0392b', color: '#fff', cursor: 'pointer' },
};

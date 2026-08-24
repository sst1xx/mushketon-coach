import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, TrainingRecord } from '../db/schema';
import { createTraining, listTrainings, deleteTraining } from '../domain/trainingRepo';
import Modal from '../components/Modal';
import s from './TrainingsScreen.module.css';

interface Props {
  athlete: AthleteRecord;
  epoch: number;
  onBack: () => void;
  onSelectTraining: (t: TrainingRecord) => void;
  onOpenRemarks?: () => void;
  onOpenAllShots?: () => void;
}

export default function TrainingsScreen({ athlete, epoch, onBack, onSelectTraining, onOpenRemarks, onOpenAllShots }: Props) {
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

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
     <div className={s.page}>
       <div className={s.header}>
         <button className={s.back} onClick={onBack}>◀ Назад</button>
         <span className={s.athleteName}>{athlete.name}</span>
         {onOpenRemarks && (
           <button className={s.remarksBtn} onClick={onOpenRemarks}>Замечания</button>
         )}
         {onOpenAllShots && (
           <button className={s.remarksBtn} onClick={onOpenAllShots}>Все выстрелы</button>
         )}
       </div>
       <h2 className={s.title}>Тренировки</h2>

       <ul className={s.list}>
         {trainings.map(t => (
           <li key={t.id} className={s.item}>
             <button className={s.itemTap} onClick={() => onSelectTraining(t)}>
               <div className={s.itemMain}>
                 <span className={s.date}>{formatDate(t.startedAt)}</span>
                 {t.completedAt && <span className={s.badge}>Завершена</span>}
               </div>
             </button>
             <div className={s.itemActions}>
               <button className={s.delBtn} onClick={() => setConfirmDelete(t)} aria-label="Удалить">✕</button>
             </div>
           </li>
         ))}
       </ul>

       <button className={s.addBtn} onClick={handleNew}>+ Новая тренировка</button>

       <Modal
         isOpen={confirmDelete !== null}
         onClose={() => setConfirmDelete(null)}
         actions={[
           { label: 'Отмена', onClick: () => setConfirmDelete(null) },
           { label: 'Удалить', danger: true, onClick: () => confirmDelete && handleDelete(confirmDelete) },
         ]}
       >
         <p>Удалить тренировку от <strong>{confirmDelete && formatDate(confirmDelete.startedAt)}</strong>?</p>
         <p className={s.warn}>Это действие нельзя отменить.</p>
       </Modal>
     </div>
   );
}

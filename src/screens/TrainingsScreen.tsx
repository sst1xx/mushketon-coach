import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { AthleteRecord, TrainingRecord } from '../db/schema';
import { createTraining, listTrainings, deleteTraining } from '../domain/trainingRepo';
import { listShots } from '../domain/shotRepo';
import { formatTrainingTotal } from './trainingTotal';
import { getTrainingListLabel } from '../domain/trainingMode';
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
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [modeLabels, setModeLabels] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<TrainingRecord | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const load = useCallback(async () => {
    const list = await listTrainings(athlete.id);
    setTrainings(list);
    const entries = await Promise.all(
      list.map(async (t) => {
        const shots = await listShots(t.id);
        const committedCount = shots.filter(s => s.status === 'committed').length;
        return [t.id, formatTrainingTotal(shots), getTrainingListLabel(t, committedCount)] as const;
      }),
    );
    setTotals(Object.fromEntries(entries.map(([id, total]) => [id, total])));
    setModeLabels(Object.fromEntries(entries.map(([id, , label]) => [id, label])));
    setLoading(false);
   }, [athlete.id]);

  useEffect(() => { load(); }, [load]);

  const handleNew = async (targetShotCount: number) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    const newTraining = await createTraining(athlete.id, ep, targetShotCount);
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
           <button className={s.remarksBtn} onClick={onOpenRemarks}>Дневник</button>
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
                 <span className={s.total}>{totals[t.id] ?? '–'}</span>
                 {t.completedAt && <span className={s.badge}>Завершена</span>}
               </div>
               {modeLabels[t.id] && <div className={s.modeLabel}>{modeLabels[t.id]}</div>}
             </button>
             <div className={s.itemActions}>
               <button className={s.delBtn} onClick={() => setConfirmDelete(t)} aria-label="Удалить">✕</button>
             </div>
           </li>
         ))}
       </ul>

       <div className={s.newActions}>
         <button className={s.addBtn} onClick={() => setShowNewModal(true)}>+ Новое</button>
       </div>

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

       <Modal
         isOpen={showNewModal}
         onClose={() => setShowNewModal(false)}
         actions={[{ label: 'Отмена', onClick: () => setShowNewModal(false) }]}
       >
         <div className={s.newChoiceActions}>
           <button className={s.choiceBtn} onClick={() => { setShowNewModal(false); handleNew(10); }}>Серия</button>
           <button className={s.choiceBtn} onClick={() => { setShowNewModal(false); handleNew(60); }}>Упражнение ПП-3</button>
         </div>
       </Modal>
     </div>
   );
}

import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { setSetting } from '../db/settings';
import { AthleteRecord } from '../db/schema';
import { createAthlete, listAthletes, deleteAthlete } from '../domain/athleteRepo';
import Modal from '../components/Modal';
import common from '../styles/common.module.css';
import s from './AthletesScreen.module.css';

interface Props {
  epoch: number;
  onSelectAthlete: (a: AthleteRecord) => void;
  onOpenSettings?: () => void;
}

export default function AthletesScreen({ epoch, onSelectAthlete, onOpenSettings }: Props) {
  const [athletes, setAthletes] = useState<AthleteRecord[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AthleteRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setAthletes(await listAthletes());
    setLoading(false);
   }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const isFirst = athletes.length === 0;
    await createAthlete(trimmed);
    if (isFirst && 'storage' in navigator && 'persist' in navigator.storage) {
      const db = await openDB();
      const persisted = await navigator.storage.persist();
      await setSetting(db, 'storagePersisted', persisted);
     }
    setName('');
    setAdding(false);
    await load();
   };

  const handleDelete = async (a: AthleteRecord) => {
    const db = await openDB();
    const ep = await readEpoch(db);
    await deleteAthlete(a.id, ep);
    setConfirmDelete(null);
    await load();
   };

  if (loading) return <div className={s.page}><p>Загрузка…</p></div>;

  return (
     <div className={s.page}>
       <div className={s.header}>
         <h2 className={s.title}>Мои спортсмены</h2>
         {onOpenSettings && (
           <button className={s.settingsBtn} onClick={onOpenSettings}>⚙ Настройки</button>
         )}
       </div>
       <ul className={s.list}>
         {athletes.map(a => (
           <li key={a.id} className={s.item}>
             <button className={s.nameBtn} onClick={() => onSelectAthlete(a)}>{a.name}</button>
             <button className={s.delBtn} onClick={() => setConfirmDelete(a)} aria-label="Удалить">✕</button>
           </li>
         ))}
       </ul>
       {adding ? (
         <div className={s.addRow}>
           <input
            className={s.input}
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Имя спортсмена"
            maxLength={100}
           />
           <button className={common.btn} onClick={handleCreate}>Сохранить</button>
           <button className={common.btnGhost} onClick={() => { setAdding(false); setName(''); }}>Отмена</button>
         </div>
       ) : (
         <button className={s.addBtn} onClick={() => setAdding(true)}>+ Новый спортсмен</button>
       )}

       <Modal
         isOpen={confirmDelete !== null}
         onClose={() => setConfirmDelete(null)}
         actions={[
           { label: 'Отмена', onClick: () => setConfirmDelete(null) },
           { label: 'Удалить', danger: true, onClick: () => confirmDelete && handleDelete(confirmDelete) },
         ]}
       >
         <p>Удалить спортсмена <strong>{confirmDelete?.name}</strong>?</p>
         <p className={s.warn}>Это действие нельзя отменить.</p>
       </Modal>
     </div>
   );
}

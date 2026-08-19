import React, { useState, useEffect, useCallback } from 'react';
import { openDB } from '../db/open';
import { readEpoch } from '../db/tx';
import { setSetting } from '../db/settings';
import { AthleteRecord } from '../db/schema';
import { createAthlete, listAthletes, deleteAthlete } from '../domain/athleteRepo';

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

  if (loading) return <div style={s.page}><p>Загрузка…</p></div>;

  return (
     <div style={s.page}>
       <div style={s.header}>
         <h2 style={s.title}>Мои спортсмены</h2>
         {onOpenSettings && (
           <button style={s.settingsBtn} onClick={onOpenSettings}>⚙ Настройки</button>
         )}
       </div>
       <ul style={s.list}>
         {athletes.map(a => (
           <li key={a.id} style={s.item}>
             <button style={s.nameBtn} onClick={() => onSelectAthlete(a)}>{a.name}</button>
             <button style={s.delBtn} onClick={() => setConfirmDelete(a)}>✕</button>
           </li>
         ))}
       </ul>
       {adding ? (
         <div style={s.addRow}>
           <input
            style={s.input}
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="Имя спортсмена"
            maxLength={100}
           />
           <button style={s.btn} onClick={handleCreate}>Сохранить</button>
           <button style={s.btnGhost} onClick={() => { setAdding(false); setName(''); }}>Отмена</button>
         </div>
       ) : (
         <button style={s.addBtn} onClick={() => setAdding(true)}>+ Новый спортсмен</button>
       )}

       {confirmDelete && (
         <div style={s.overlay}>
           <div style={s.dialog}>
             <p>Удалить спортсмена <strong>{confirmDelete.name}</strong>?</p>
             <p style={s.warn}>Это действие нельзя отменить.</p>
             <div style={s.dialogBtns}>
               <button style={s.btn} onClick={() => setConfirmDelete(null)}>Отмена</button>
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
  header:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title:        { fontSize: 22, margin: 0 },
  settingsBtn:  { background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', color: '#1a1a2e', padding: '4px 0' },
  list:         { listStyle: 'none', padding: 0, margin: '0 0 16px' },
  item:         { display: 'flex', alignItems: 'center', borderBottom: '1px solid #eee', padding: '4px 0' },
  nameBtn:      { flex: 1, background: 'none', border: 'none', textAlign: 'left', fontSize: 17, padding: '10px 0', cursor: 'pointer' },
  delBtn:       { background: 'none', border: 'none', color: '#999', fontSize: 18, cursor: 'pointer', padding: '0 8px' },
  addRow:       { display: 'flex', gap: 8, flexWrap: 'wrap' },
  input:        { flex: 1, fontSize: 16, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6, minWidth: 0 },
  btn:          { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
  btnGhost:     { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  btnDanger:    { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#c0392b', color: '#fff', cursor: 'pointer' },
  addBtn:       { width: '100%', padding: '12px', fontSize: 16, borderRadius: 8, border: '2px dashed #ccc', background: 'none', cursor: 'pointer', color: '#555' },
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog:       { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 320, width: '90%' },
  dialogBtns:   { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 },
  warn:         { color: '#888', fontSize: 14 },
};

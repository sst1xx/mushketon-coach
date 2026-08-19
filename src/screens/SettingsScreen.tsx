import React, { useState, useEffect, useRef } from 'react';
import { openDB } from '../db/open';
import { getSetting, setSetting } from '../db/settings';
import { exportBackup, importBackup, validateBackup } from '../domain/backupService';

interface Props {
  onBack: () => void;
}

function fmtBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} КБ`;
  return `${(b / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function SettingsScreen({ onBack }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if ('storage' in navigator) {
        const est = await navigator.storage.estimate();
        setStorageInfo({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      }
      const db = await openDB();
      const persisted = await getSetting(db, 'storagePersisted');
      setStoragePersisted(persisted as boolean | null);
    })();
  }, []);

  const handleExport = async () => {
    try {
      setStatus('Создание резервной копии…');
      const backup = await exportBackup();
      await setSetting(await openDB(), 'lastBackupAt', new Date().toISOString());
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `coach-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Резервная копия сохранена.');
    } catch (e: any) {
      setStatus(e?.message ?? 'Ошибка создания резервной копии.');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      setStatus('Проверка файла…');
      const text = await file.text();
      const data = JSON.parse(text);
      validateBackup(data);
      setConfirmRestore(data);
      setStatus(null);
    } catch (err: any) {
      setStatus('Файл резервной копии повреждён или несовместим. Данные не изменены.');
    }
  };

  const handleRestoreConfirm = async () => {
    try {
      setStatus('Восстановление…');
      await importBackup(confirmRestore);
      setConfirmRestore(null);
      setStatus('Данные восстановлены. Приложение перезагрузится.');
      setTimeout(() => location.reload(), 1500);
    } catch (e: any) {
      setConfirmRestore(null);
      setStatus(e?.message ?? 'Ошибка восстановления.');
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.back} onClick={onBack}>◀ Назад</button>
        <span style={s.title}>Настройки</span>
      </div>

      {/* Section: Данные */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Данные</h3>
        <div style={s.divider} />
        <button style={s.fullBtn} onClick={handleExport}>Сохранить резервную копию</button>
        <button style={s.fullBtn} onClick={() => fileInputRef.current?.click()}>
          Восстановить из резервной копии
        </button>
        <input
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </section>

      {/* Section: Хранилище */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Хранилище</h3>
        {storageInfo && (
          <p style={s.info}>
            Использовано: {fmtBytes(storageInfo.usage)} из {fmtBytes(storageInfo.quota)}
          </p>
        )}
        <p style={s.info}>
          Постоянное хранение:{' '}
          {storagePersisted === true ? 'Да' : storagePersisted === false ? 'Нет' : 'Неизвестно'}
        </p>
        {storagePersisted === false && (
          <p style={s.warn}>
            Браузер может удалить локальные данные при нехватке места. Регулярно сохраняйте резервную копию.
          </p>
        )}
      </section>

      {/* Section: Анализ */}
      <section style={s.section}>
        <h3 style={s.sectionTitle}>Анализ</h3>
        <div style={s.divider} />
        <p style={s.info}>В разработке</p>
      </section>

      {/* Status message */}
      {status && <p style={s.status}>{status}</p>}

      {/* Confirm restore dialog */}
      {confirmRestore !== null && (
        <div style={s.overlay}>
          <div style={s.dialog}>
            <p>Восстановить резервную копию?</p>
            <p style={s.dialogInfo}>
              Текущие данные будут заменены данными из выбранной копии.
            </p>
            <div style={s.dialogBtns}>
              <button style={s.btnGhost} onClick={() => setConfirmRestore(null)}>Отмена</button>
              <button style={s.btnDanger} onClick={handleRestoreConfirm}>Восстановить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:       { maxWidth: 480, margin: '0 auto', padding: '16px 16px 32px', fontFamily: 'sans-serif' },
  header:     { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 },
  back:       { background: 'none', border: 'none', fontSize: 15, cursor: 'pointer', color: '#1a1a2e', padding: '4px 0' },
  title:      { fontSize: 20, fontWeight: 600 },
  section:    { marginBottom: 24 },
  sectionTitle: { fontSize: 16, color: '#555', margin: '0 0 8px' },
  divider:    { height: 1, background: '#eee', margin: '8px 0 16px' },
  fullBtn:    { display: 'block', width: '100%', padding: '12px', fontSize: 15, borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', textAlign: 'left', marginBottom: 8 },
  info:       { fontSize: 14, color: '#333', margin: '4px 0' },
  warn:       { fontSize: 13, color: '#c0392b', margin: '8px 0', lineHeight: 1.4 },
  status:     { fontSize: 14, color: '#27ae60', marginTop: 16, textAlign: 'center' },
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  dialog:     { background: '#fff', borderRadius: 12, padding: 24, maxWidth: 320, width: '90%', textAlign: 'center' },
  dialogInfo: { color: '#555', fontSize: 14, margin: '8px 0 0' },
  dialogBtns: { display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 },
  btnGhost:   { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: '1px solid #ccc', background: 'none', cursor: 'pointer' },
  btnDanger:  { padding: '8px 16px', fontSize: 15, borderRadius: 6, border: 'none', background: '#1a1a2e', color: '#fff', cursor: 'pointer' },
};

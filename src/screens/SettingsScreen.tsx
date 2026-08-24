import React, { useState, useEffect, useRef } from 'react';
import { openDB } from '../db/open';
import { getSetting, setSetting } from '../db/settings';
import { exportBackup, importBackup, validateBackup } from '../domain/backupService';
import Modal from '../components/Modal';
import s from './SettingsScreen.module.css';

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
    <div className={s.page}>
      <div className={s.header}>
        <button className={s.back} onClick={onBack}>◀ Назад</button>
        <span className={s.title}>Настройки</span>
      </div>

      {/* Section: Данные */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>Данные</h3>
        <div className={s.divider} />
        <button className={s.fullBtn} onClick={handleExport}>Сохранить резервную копию</button>
        <button className={s.fullBtn} onClick={() => fileInputRef.current?.click()}>
          Восстановить из резервной копии
        </button>
        <input
          type="file"
          accept="application/json"
          className={s.hiddenInput}
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </section>

      {/* Section: Хранилище */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>Хранилище</h3>
        {storageInfo && (
          <p className={s.info}>
            Использовано: {fmtBytes(storageInfo.usage)} из {fmtBytes(storageInfo.quota)}
          </p>
        )}
        <p className={s.info}>
          Постоянное хранение:{' '}
          {storagePersisted === true ? 'Да' : storagePersisted === false ? 'Нет' : 'Неизвестно'}
        </p>
        {storagePersisted === false && (
          <p className={s.warn}>
            Браузер может удалить локальные данные при нехватке места. Регулярно сохраняйте резервную копию.
          </p>
        )}
      </section>

      {/* Status message */}
      {status && <p className={s.status}>{status}</p>}

      {/* Confirm restore dialog */}
      <Modal
        isOpen={confirmRestore !== null}
        onClose={() => setConfirmRestore(null)}
        actions={[
          { label: 'Отмена', onClick: () => setConfirmRestore(null) },
          { label: 'Восстановить', danger: true, onClick: handleRestoreConfirm },
        ]}
      >
        <p>Восстановить резервную копию?</p>
        <p className={s.dialogInfo}>
          Текущие данные будут заменены данными из выбранной копии.
        </p>
      </Modal>
    </div>
  );
}

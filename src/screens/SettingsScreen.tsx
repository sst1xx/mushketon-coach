import React, { useState, useEffect, useRef } from 'react';
import { openDB } from '../db/open';
import { getSetting, setSetting } from '../db/settings';
import { exportBackup, importBackup, validateBackup } from '../domain/backupService';
import { applyTheme, isThemeMode, type ThemeMode } from '../utils/theme';
import Modal from '../components/Modal';
import AiAnalysisModal from '../components/AiAnalysisModal';
import { generatePkce, getAuthUrl, fetchFreeModels } from '../ai/openrouter';
import { DEFAULT_MODEL, type AiModel } from '../ai/models';
import { listAthletes } from '../domain/athleteRepo';
import type { AthleteRecord } from '../db/schema';
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
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Анализ с AI (see PLAN-AI-ANALYSIS.md §7)
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [aiModel, setAiModel] = useState<string>(DEFAULT_MODEL);
  const [customModel, setCustomModel] = useState<string>('');
  const [freeModels, setFreeModels] = useState<AiModel[]>([]);
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<AthleteRecord[]>([]);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string>('');
  const [analysisAthlete, setAnalysisAthlete] = useState<AthleteRecord | null>(null);

  useEffect(() => {
    (async () => {
      if ('storage' in navigator) {
        const est = await navigator.storage.estimate();
        setStorageInfo({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
      }
      const db = await openDB();
      const persisted = await getSetting(db, 'storagePersisted');
      setStoragePersisted(persisted as boolean | null);
      const tm = await getSetting(db, 'themeMode');
      if (isThemeMode(tm)) setThemeMode(tm);

      const token = await getSetting(db, 'openrouterToken');
      if (typeof token === 'string' && token) {
        setApiKey(token);
        try {
          const models = await fetchFreeModels(token);
          setFreeModels(models);
        } catch {
          setAiStatus('Не удалось загрузить список бесплатных моделей.');
        }
      }
      const savedModel = await getSetting(db, 'aiModel');
      if (typeof savedModel === 'string' && savedModel) setAiModel(savedModel);

      const list = await listAthletes();
      setAthletes(list);
      if (list.length > 0) setSelectedAthleteId(list[0].id);
    })();
  }, []);

  const handleAiLogin = async () => {
    const { verifier, challenge } = await generatePkce();
    localStorage.setItem('or_pkce_verifier', verifier);
    const callbackUrl = window.location.origin + window.location.pathname;
    window.location.href = getAuthUrl(callbackUrl, challenge);
  };

  const handleAiLogout = async () => {
    const db = await openDB();
    await setSetting(db, 'openrouterToken', null);
    setApiKey(null);
    setFreeModels([]);
  };

  const handleModelSelect = async (value: string) => {
    setAiModel(value);
    if (value !== 'custom') {
      await setSetting(await openDB(), 'aiModel', value);
    }
  };

  const handleCustomModelChange = async (value: string) => {
    setCustomModel(value);
    await setSetting(await openDB(), 'aiModel', value);
  };

  const handleThemeChange = async (mode: ThemeMode) => {
    setThemeMode(mode);
    applyTheme(mode);
    await setSetting(await openDB(), 'themeMode', mode);
  };

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

      {/* Section: Тема */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>Тема</h3>
        <div className={s.divider} />
        <div className={s.themeRow}>
          <button
            className={s.themeBtn}
            aria-pressed={themeMode === 'light'}
            onClick={() => handleThemeChange('light')}
          >
            Светлая
          </button>
          <button
            className={s.themeBtn}
            aria-pressed={themeMode === 'dark'}
            onClick={() => handleThemeChange('dark')}
          >
            Тёмная
          </button>
        </div>
      </section>

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

      {/* Section: Анализ с AI */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>Анализ с AI</h3>
        <div className={s.divider} />
        {!apiKey && (
          <button className={s.fullBtn} onClick={handleAiLogin}>Войти через OpenRouter</button>
        )}
        {apiKey && (
          <div className={s.aiConnectedRow}>
            <span className={s.info}>✓ Подключено</span>
            <button className={s.linkBtn} onClick={handleAiLogout}>Выйти</button>
          </div>
        )}
        {aiStatus && <p className={s.warn}>{aiStatus}</p>}
        {apiKey && (
          <>
            <label className={s.info} htmlFor="ai-model-select">Модель</label>
            <select
              id="ai-model-select"
              className={s.select}
              value={freeModels.some(m => m.id === aiModel) ? aiModel : 'custom'}
              onChange={e => handleModelSelect(e.target.value)}
            >
              {freeModels.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
              <option value="custom">Другая…</option>
            </select>
            {!freeModels.some(m => m.id === aiModel) && (
              <input
                type="text"
                className={s.customModelInput}
                placeholder="введите ID модели"
                value={customModel || aiModel}
                onChange={e => handleCustomModelChange(e.target.value)}
              />
            )}
            {athletes.length > 1 && (
              <>
                <label className={s.info} htmlFor="ai-athlete-select">Атлет</label>
                <select
                  id="ai-athlete-select"
                  className={s.select}
                  value={selectedAthleteId}
                  onChange={e => setSelectedAthleteId(e.target.value)}
                >
                  {athletes.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </>
            )}
            <button
              className={s.fullBtn}
              disabled={athletes.length === 0}
              onClick={() => setAnalysisAthlete(athletes.find(a => a.id === selectedAthleteId) ?? athletes[0])}
            >
              Запустить анализ
            </button>
          </>
        )}
      </section>

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
      {analysisAthlete && (
        <AiAnalysisModal
          athlete={analysisAthlete}
          apiKey={apiKey!}
          model={freeModels.some(m => m.id === aiModel) ? aiModel : (customModel || aiModel)}
          onClose={() => setAnalysisAthlete(null)}
        />
      )}
    </div>
  );
}

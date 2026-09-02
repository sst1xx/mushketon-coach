/**
 * Modal for the "Анализ с AI" flow: pick trainings for the current
 * athlete, get one-time consent, send the prompt to OpenRouter, and show
 * the result. See PLAN-AI-ANALYSIS.md §8.
 */
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Modal from './Modal';
import { openDB } from '../db/open';
import { getSetting, setSetting } from '../db/settings';
import { listTrainings } from '../domain/trainingRepo';
import { listShots } from '../domain/shotRepo';
import { listCommentsByTraining } from '../domain/commentRepo';
import { getGeneralComment } from '../domain/generalCommentRepo';
import { listSeriesCommentsByTraining } from '../domain/seriesCommentRepo';
import type { AthleteRecord, TrainingRecord, ShotRecord, CommentRecord } from '../db/schema';
import { buildSystemPrompt, buildUserPrompt, type TrainingWithShots } from '../ai/buildPrompt';
import { callChat, type ChatProgress } from '../ai/openrouter';
import s from './AiAnalysisModal.module.css';

interface Props {
  athlete: AthleteRecord;
  apiKey: string;
  model: string;
  onClose: () => void;
}

type Phase = 'loading' | 'select' | 'consent' | 'running' | 'result' | 'error';

interface TrainingEntry {
  training: TrainingRecord;
  shots: ShotRecord[];
  comments: CommentRecord[];
  trainingComments: string[];
}

export default function AiAnalysisModal({ athlete, apiKey, model, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [entries, setEntries] = useState<TrainingEntry[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [progress, setProgress] = useState<ChatProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (async () => {
      const trainings = await listTrainings(athlete.id);
      const withShots = await Promise.all(
        trainings.map(async training => {
          const [shots, comments, general, series] = await Promise.all([
            listShots(training.id),
            listCommentsByTraining(training.id),
            getGeneralComment(training.id),
            listSeriesCommentsByTraining(training.id),
          ]);
          const trainingComments = [
            ...(general ? [general.text] : []),
            ...series.map(sc => sc.text),
          ];
          return { training, shots, comments, trainingComments };
        }),
      );
      setEntries(withShots);
      const preselected: Record<string, boolean> = {};
      withShots.slice(0, 3).forEach(({ training }) => { preselected[training.id] = true; });
      setSelected(preselected);
      setPhase('select');
    })();
  }, [athlete.id]);

  // Abort any in-flight fetch if the modal unmounts while a request is
  // running (e.g. the coach dismisses it via Escape/backdrop mid-request).
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const toggle = (id: string) => setSelected(prev => ({ ...prev, [id]: !prev[id] }));
  const selectAll = () => setSelected(Object.fromEntries(entries.map(e => [e.training.id, true])));
  const selectNone = () => setSelected({});

  const selectedEntries = entries.filter(e => selected[e.training.id]);
  const hasCommittedShots = selectedEntries.some(e => e.shots.some(sh => sh.status === 'committed'));

  const runAnalysis = useCallback(async () => {
    setPhase('running');
    setErrorMessage('');
    setProgress(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const trainingsWithShots: TrainingWithShots[] = selectedEntries.map(e => ({
        training: e.training,
        shots: e.shots,
        comments: e.comments,
        trainingComments: e.trainingComments,
      }));
      const text = await callChat(
        apiKey, model,
        buildSystemPrompt(), buildUserPrompt(trainingsWithShots),
        controller.signal,
        (p) => setProgress(p),
      );
      setResult(text);
      setPhase('result');
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setPhase('select');
        return;
      }
      setErrorMessage(describeError(e));
      setPhase('error');
    }
  }, [apiKey, model, selectedEntries]);

  const handleAnalyzeClick = async () => {
    const db = await openDB();
    const consent = await getSetting(db, 'aiConsentGiven');
    if (consent === true) {
      await runAnalysis();
    } else {
      setPhase('consent');
    }
  };

  const handleConsentAccept = async () => {
    const db = await openDB();
    await setSetting(db, 'aiConsentGiven', true);
    await runAnalysis();
  };

  const handleCancelRunning = () => {
    abortRef.current?.abort();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result);
    } catch {
      // Clipboard access can fail (permissions/older browsers); silently ignore.
    }
  };

  return (
    <Modal isOpen={true} title="Анализ с AI" onClose={onClose}>
      {phase === 'loading' && <p className={s.info}>Загрузка тренировок…</p>}

      {phase === 'select' && (
        <div>
          <p className={s.info}>Выберите тренировки для анализа</p>
          {entries.length === 0 && <p className={s.info}>Нет тренировок для анализа.</p>}
          <ul className={s.list}>
            {entries.map(({ training, shots }) => {
              const committed = shots.filter(sh => sh.status === 'committed');
              const committedCount = committed.length;
              const intSum = committed.reduce((acc, sh) => acc + Math.floor(sh.score / 10), 0);
              const decSum = committed.reduce((acc, sh) => acc + sh.score, 0) / 10;
              return (
                <li key={training.id} className={s.listItem}>
                  <label className={s.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={!!selected[training.id]}
                      onChange={() => toggle(training.id)}
                    />
                    <span>{training.startedAt.slice(0, 10)} — {intSum} ({decSum.toFixed(1)}) · {committedCount} выст.</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {entries.length > 0 && (
            <div className={s.selectRow}>
              <button className={s.linkBtn} onClick={selectAll}>Выбрать все</button>
              <button className={s.linkBtn} onClick={selectNone}>Снять все</button>
            </div>
          )}
          <div className={s.actions}>
            <button className={s.btnGhost} onClick={onClose}>Отмена</button>
            <button className={s.btnPrimary} disabled={!hasCommittedShots} onClick={handleAnalyzeClick}>
              Анализировать
            </button>
          </div>
        </div>
      )}

      {phase === 'consent' && (
        <div>
          <p className={s.info}>
            Данные о тренировках будут отправлены в OpenRouter и обработаны выбранной AI-моделью.
            Имя спортсмена не передаётся. Провайдеры бесплатных моделей могут сохранять запросы.
          </p>
          <div className={s.actions}>
            <button className={s.btnGhost} onClick={() => setPhase('select')}>Отмена</button>
            <button className={s.btnPrimary} onClick={handleConsentAccept}>Понятно, продолжить</button>
          </div>
        </div>
      )}

      {phase === 'running' && (
        <div>
          <p className={s.info}>Анализирую тренировки…</p>
          {progress && (
            <div className={s.progress}>
              <span>↑ Отправлено: {fmtBytes(progress.sentBytes)}</span>
              <span>↓ Получено:&nbsp;&nbsp;{fmtBytes(progress.receivedBytes)}</span>
            </div>
          )}
          <div className={s.actions}>
            <button className={s.btnGhost} onClick={handleCancelRunning}>Отменить</button>
          </div>
        </div>
      )}

      {phase === 'result' && (
        <div>
          <div className={s.result}>{result}</div>
          <div className={s.actions}>
            <button className={s.btnGhost} onClick={handleCopy}>Копировать</button>
            <button className={s.btnPrimary} onClick={onClose}>Закрыть</button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div>
          <p className={s.warn}>{errorMessage}</p>
          <div className={s.actions}>
            <button className={s.btnGhost} onClick={onClose}>Закрыть</button>
            <button className={s.btnPrimary} onClick={runAnalysis}>Повторить</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} КБ`;
  return `${(b / (1024 * 1024)).toFixed(1)} МБ`;
}

function describeError(e: any): string {
  const status = e?.status;
  if (status === 401) return 'Ключ отозван, войдите снова через OpenRouter.';
  if (status === 402) return 'Недостаточно кредитов на аккаунте OpenRouter.';
  if (status === 429) return 'Превышен лимит запросов, попробуйте позже.';
  if (status === 404) return 'Выбранная модель недоступна. Попробуйте другую модель в настройках.';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Нет подключения к интернету.';
  return e?.message ?? 'Не удалось выполнить анализ.';
}

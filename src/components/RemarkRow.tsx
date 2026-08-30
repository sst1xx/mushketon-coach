import React from 'react';
import s from './RemarkRow.module.css';

/**
 * Single unified row for any kind of remark (general / series / shot),
 * including the ones nested inside a ПП-3 series entry — see
 * PLAN-DIARY-AFFORDANCE.md §3. Every remark row looks and behaves the same:
 * clicking the text opens the full-screen editor, the optional meta line
 * (shot label + date) navigates to the target, and `✎`/`✕` are always
 * explicit, separate actions.
 */
interface RemarkRowProps {
  /** Optional label above the text, e.g. "Общее замечание серии 3". */
  label?: string;
  text: string;
  /** Meta line under the text (e.g. "Выстрел №4 · 10.4 · 01.01.2024 10:02"). */
  metaLabel?: string;
  /** Present only for shot comments: clicking the meta line opens the target. */
  onOpenMeta?: () => void;
  /** Clicking the text itself opens the editor (same target as `onEdit`). */
  onOpenEditor: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** Indented layout for rows nested inside a ПП-3 series entry. */
  nested?: boolean;
}

export function RemarkRow({ label, text, metaLabel, onOpenMeta, onOpenEditor, onEdit, onDelete, nested }: RemarkRowProps) {
  return (
    <div className={nested ? `${s.row} ${s.nested}` : s.row}>
      <button type="button" className={s.body} onClick={onOpenEditor}>
        {label && <span className={s.label}>{label}</span>}
        <p className={s.text}>{text}</p>
      </button>
      <div className={s.side}>
        {metaLabel && (
          onOpenMeta ? (
            <button type="button" className={s.meta} onClick={onOpenMeta}>{metaLabel}</button>
          ) : (
            <p className={s.metaStatic}>{metaLabel}</p>
          )
        )}
        <div className={s.actions}>
          <button type="button" className={s.editBtn} onClick={onEdit} aria-label="Редактировать">✎</button>
          <button type="button" className={s.delBtn} onClick={onDelete} aria-label="Удалить">✕</button>
        </div>
      </div>
    </div>
  );
}

interface RemarkRowEmptyProps {
  addLabel: string;
  onAdd: () => void;
  nested?: boolean;
}

/** Unified empty state: always an actionable dashed "+ Добавить…" button, never passive text. */
export function RemarkRowEmpty({ addLabel, onAdd, nested }: RemarkRowEmptyProps) {
  return (
    <button
      type="button"
      className={nested ? `${s.addBtn} ${s.nested}` : s.addBtn}
      onClick={onAdd}
    >
      {addLabel}
    </button>
  );
}

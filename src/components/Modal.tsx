import React, { useEffect, useRef } from 'react';
import { bindEscapeKey, checkBackdropClick, getFocusTrapTarget, excludeDisabled, applyScrollLock, restoreScrollLock } from './modalController';
import styles from './Modal.module.css';
import common from '../styles/common.module.css';

export interface ModalAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface Props {
  isOpen: boolean;
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
  actions?: ModalAction[];
}

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Elements matched by FOCUSABLE_SELECTOR may carry a boolean `disabled`
// attribute (button/input/select/textarea); links and [tabindex] never do.
type FocusableEl = HTMLElement & { disabled?: boolean };

export default function Modal({ isOpen, title, children, onClose, actions }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2)}`).current;
  const contentId = useRef(`modal-content-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = bindEscapeKey(document, onClose);
    return unsubscribe;
  }, [isOpen, onClose]);

  // Lock background scroll while the dialog is open; restore whatever the
  // page had set beforehand (rather than assuming a fixed default).
  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = applyScrollLock(document.body.style);
    return () => restoreScrollLock(document.body.style, previousOverflow);
  }, [isOpen]);

  // Focus management: move focus into the dialog on open, return it to the
  // triggering element on close/unmount (WCAG 2.4.3 focus order).
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialogEl = dialogRef.current;
    const focusable = excludeDisabled(
      Array.from(dialogEl?.querySelectorAll<FocusableEl>(FOCUSABLE_SELECTOR) ?? []),
    )[0] ?? null;
    (focusable ?? dialogEl)?.focus();
    return () => {
      previouslyFocused?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (checkBackdropClick(e.target, backdropRef.current)) {
      onClose();
    }
  };

  // Keep Tab/Shift+Tab focus contained within the dialog (WCAG 2.4.3): the
  // decision of where to wrap is delegated to the pure `getFocusTrapTarget`.
  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const dialogEl = dialogRef.current;
    if (!dialogEl) return;
    const focusable = excludeDisabled(Array.from(dialogEl.querySelectorAll<FocusableEl>(FOCUSABLE_SELECTOR)));
    const elements = focusable.length > 0 ? focusable : [dialogEl];
    const target = getFocusTrapTarget(elements, document.activeElement, e.shiftKey);
    if (target) {
      e.preventDefault();
      (target as HTMLElement).focus();
    }
  };

  return (
    <div
      ref={backdropRef}
      className={styles.backdrop}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : contentId}
        aria-describedby={contentId}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        {title && <p id={titleId} className={styles.title}>{title}</p>}
        <div id={contentId}>{children}</div>
        {actions && actions.length > 0 && (
          <div className={styles.actions}>
            {actions.map((a, i) => (
              <button
                key={i}
                className={a.danger ? common.btnDanger : common.btnGhost}
                onClick={a.onClick}
                disabled={a.disabled}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Pure controller for Modal interaction logic. No React, no DOM types
// beyond minimal duck-typed interfaces so it stays 100% Node-testable.

export type CloseReason = 'escape' | 'backdrop' | 'explicit';

export interface KeyboardEventLike {
  key: string;
}

export interface DocumentLike {
  addEventListener(type: 'keydown', listener: (e: KeyboardEventLike) => void): void;
  removeEventListener(type: 'keydown', listener: (e: KeyboardEventLike) => void): void;
}

/**
 * Binds an Escape-key listener to `doc` while the modal is open.
 * Returns an unsubscribe function; call it on close/unmount.
 */
export function bindEscapeKey(doc: DocumentLike, onEscape: () => void): () => void {
  const listener = (e: KeyboardEventLike) => {
    if (e.key === 'Escape') onEscape();
  };
  doc.addEventListener('keydown', listener);
  return () => doc.removeEventListener('keydown', listener);
}

/**
 * Decides whether a pointer/click event that bubbled up to the backdrop
 * element should close the modal: only when the event target IS the
 * backdrop element itself (i.e. the click did not originate inside the
 * dialog, which calls stopPropagation).
 */
export function checkBackdropClick(eventTarget: unknown, backdropElement: unknown): boolean {
  return eventTarget === backdropElement;
}

/** Resolves the close reason into a single normalized close call. */
export function closeRequested(
  reason: CloseReason,
  onClose: (reason: CloseReason) => void,
): void {
  onClose(reason);
}

/**
 * Decides where Tab/Shift+Tab focus should wrap to, given the ordered list of
 * focusable elements inside the dialog and the element currently focused.
 * Returns `null` when the browser's default focus movement should be left
 * alone (i.e. we're not at either edge of the trap yet).
 */
export function getFocusTrapTarget(
  focusableElements: readonly unknown[],
  activeElement: unknown,
  shiftKey: boolean,
): unknown | null {
  if (focusableElements.length === 0) return null;
  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];
  if (shiftKey) {
    return activeElement === first ? last : null;
  }
  return activeElement === last ? first : null;
}

export interface DisableableLike {
  disabled?: boolean;
}

/**
 * Filters out disabled elements from a focusable-candidate list. `disabled`
 * elements still match CSS focusable selectors (e.g. `button`) but are not
 * part of the tab order, so they must be excluded before computing focus
 * trap wrap targets — otherwise Tab/Shift+Tab can escape the dialog when
 * the first/last matched element happens to be disabled.
 */
export function excludeDisabled<T extends DisableableLike>(elements: readonly T[]): T[] {
  return elements.filter(el => !el.disabled);
}

export interface StyleLike {
  overflow: string;
}

/** Locks background scroll while a modal is open; returns the prior value to restore later. */
export function applyScrollLock(style: StyleLike): string {
  const previousOverflow = style.overflow;
  style.overflow = 'hidden';
  return previousOverflow;
}

/** Restores the background scroll state captured by `applyScrollLock`. */
export function restoreScrollLock(style: StyleLike, previousOverflow: string): void {
  style.overflow = previousOverflow;
}

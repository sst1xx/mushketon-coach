import { describe, it, expect, vi } from 'vitest';
import { bindEscapeKey, checkBackdropClick, closeRequested, getFocusTrapTarget, excludeDisabled, applyScrollLock, restoreScrollLock } from './modalController';
import type { DocumentLike, StyleLike } from './modalController';

function makeFakeDocument(): { doc: DocumentLike; fire: (key: string) => void } {
  const listeners: Array<(e: { key: string }) => void> = [];
  const doc: DocumentLike = {
    addEventListener: (_type, listener) => { listeners.push(listener); },
    removeEventListener: (_type, listener) => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    },
  };
  return { doc, fire: (key: string) => listeners.forEach(l => l({ key })) };
}

describe('bindEscapeKey', () => {
  it('calls onEscape when Escape key fires', () => {
    const { doc, fire } = makeFakeDocument();
    const onEscape = vi.fn();
    bindEscapeKey(doc, onEscape);
    fire('Escape');
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  it('ignores non-Escape keys', () => {
    const { doc, fire } = makeFakeDocument();
    const onEscape = vi.fn();
    bindEscapeKey(doc, onEscape);
    fire('Enter');
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('unsubscribe stops further Escape handling', () => {
    const { doc, fire } = makeFakeDocument();
    const onEscape = vi.fn();
    const unsubscribe = bindEscapeKey(doc, onEscape);
    unsubscribe();
    fire('Escape');
    expect(onEscape).not.toHaveBeenCalled();
  });
});

describe('checkBackdropClick', () => {
  it('returns true when the click target is the backdrop element itself', () => {
    const backdrop = {};
    expect(checkBackdropClick(backdrop, backdrop)).toBe(true);
  });

  it('returns false when the click originated inside the dialog (different target)', () => {
    const backdrop = {};
    const dialogChild = {};
    expect(checkBackdropClick(dialogChild, backdrop)).toBe(false);
  });
});

describe('getFocusTrapTarget', () => {
  it('wraps Tab from the last element back to the first', () => {
    const first = {}; const middle = {}; const last = {};
    expect(getFocusTrapTarget([first, middle, last], last, false)).toBe(first);
  });

  it('wraps Shift+Tab from the first element back to the last', () => {
    const first = {}; const middle = {}; const last = {};
    expect(getFocusTrapTarget([first, middle, last], first, true)).toBe(last);
  });

  it('returns null (default behavior) when Tab is pressed away from the last element', () => {
    const first = {}; const middle = {}; const last = {};
    expect(getFocusTrapTarget([first, middle, last], middle, false)).toBeNull();
  });

  it('returns null (default behavior) when Shift+Tab is pressed away from the first element', () => {
    const first = {}; const middle = {}; const last = {};
    expect(getFocusTrapTarget([first, middle, last], middle, true)).toBeNull();
  });

  it('returns null when there are no focusable elements', () => {
    expect(getFocusTrapTarget([], {}, false)).toBeNull();
  });

  it('wraps a single focusable element to itself on Tab', () => {
    const only = {};
    expect(getFocusTrapTarget([only], only, false)).toBe(only);
  });

  it('does not wrap to a disabled element when the trap list was not pre-filtered', () => {
    // Regression guard: callers must exclude disabled elements before calling
    // getFocusTrapTarget, otherwise Tab/Shift+Tab can land on/escape via a
    // disabled control. This test documents the contract at the boundary the
    // real fix (excludeDisabled) is applied at in Modal.tsx.
    const first = { disabled: true };
    const middle = {};
    const last = { disabled: true };
    const filtered = excludeDisabled([first, middle, last]);
    expect(filtered).toEqual([middle]);
    expect(getFocusTrapTarget(filtered, middle, false)).toBe(middle);
  });
});

describe('excludeDisabled', () => {
  it('removes elements with disabled: true', () => {
    const enabled1 = { disabled: false };
    const disabled = { disabled: true };
    const enabled2 = {};
    expect(excludeDisabled([enabled1, disabled, enabled2])).toEqual([enabled1, enabled2]);
  });

  it('keeps focus trap wrap target within enabled elements when the edge element is disabled', () => {
    const first = {};
    const middleDisabled = { disabled: true };
    const last = {};
    const focusable = excludeDisabled([first, middleDisabled, last]);
    expect(focusable).toEqual([first, last]);
    expect(getFocusTrapTarget(focusable, last, false)).toBe(first);
    expect(getFocusTrapTarget(focusable, first, true)).toBe(last);
  });

  it('returns an empty array when all elements are disabled', () => {
    expect(excludeDisabled([{ disabled: true }, { disabled: true }])).toEqual([]);
  });
});

describe('applyScrollLock / restoreScrollLock', () => {
  it('sets overflow to hidden and returns the previous value', () => {
    const style: StyleLike = { overflow: 'visible' };
    const previous = applyScrollLock(style);
    expect(style.overflow).toBe('hidden');
    expect(previous).toBe('visible');
  });

  it('restores the captured previous overflow value', () => {
    const style: StyleLike = { overflow: 'visible' };
    const previous = applyScrollLock(style);
    restoreScrollLock(style, previous);
    expect(style.overflow).toBe('visible');
  });

  it('restores an empty previous overflow value (no inline override before locking)', () => {
    const style: StyleLike = { overflow: '' };
    const previous = applyScrollLock(style);
    restoreScrollLock(style, previous);
    expect(style.overflow).toBe('');
  });
});

describe('closeRequested', () => {
  it('forwards the reason to onClose for escape', () => {
    const onClose = vi.fn();
    closeRequested('escape', onClose);
    expect(onClose).toHaveBeenCalledWith('escape');
  });

  it('forwards the reason to onClose for backdrop', () => {
    const onClose = vi.fn();
    closeRequested('backdrop', onClose);
    expect(onClose).toHaveBeenCalledWith('backdrop');
  });

  it('forwards the reason to onClose for explicit', () => {
    const onClose = vi.fn();
    closeRequested('explicit', onClose);
    expect(onClose).toHaveBeenCalledWith('explicit');
  });
});

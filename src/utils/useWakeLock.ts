import { useEffect } from 'react';
import { WakeLockController } from './wakeLockController';

/**
 * Keeps the screen awake while `enabled` is true (training screen, active
 * series). Thin wrapper around the pure WakeLockController; real acquisition
 * and visibility-change recovery are validated via manual device QA — this
 * hook is compile/type-checked only in the Node test environment.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
    const controller = new WakeLockController(navigator, document);
    controller.start();
    return () => { controller.stop(); };
  }, [enabled]);
}

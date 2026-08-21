// Pure Screen Wake Lock controller. No React, no direct browser globals —
// all dependencies are injected so this stays 100% Node-testable.

export interface WakeLockSentinelLike {
  released: boolean;
  addEventListener(type: 'release', listener: () => void): void;
  release(): Promise<void>;
}

export interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

export interface NavigatorLike {
  wakeLock?: WakeLockLike;
}

export interface DocumentLike {
  visibilityState: 'visible' | 'hidden';
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export class WakeLockController {
  private navigatorLike: NavigatorLike;
  private documentLike: DocumentLike;
  private sentinel: WakeLockSentinelLike | null = null;
  private active = false;
  private visibilityListener: (() => void) | null = null;
  private acquiringPromise: Promise<void> | null = null;

  constructor(navigatorLike: NavigatorLike, documentLike: DocumentLike) {
    this.navigatorLike = navigatorLike;
    this.documentLike = documentLike;
  }

  /** Requests the wake lock and subscribes to visibility changes for re-acquisition. */
  async start(): Promise<void> {
    this.active = true;
    await this.acquire();
    // stop() may have run while acquire() was still in flight — don't subscribe a
    // listener for a session that has already been torn down.
    if (this.active && !this.visibilityListener) {
      this.visibilityListener = () => this.onVisibilityChange(this.documentLike.visibilityState);
      this.documentLike.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  /** Releases the wake lock and unsubscribes from visibility changes. */
  async stop(): Promise<void> {
    this.active = false;
    if (this.visibilityListener) {
      this.documentLike.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    await this.release();
  }

  /** Re-acquires the lock when the page becomes visible again after backgrounding. */
  onVisibilityChange(visibilityState: 'visible' | 'hidden'): void {
    if (!this.active) return;
    if (
      visibilityState === 'visible' &&
      (this.sentinel === null || this.sentinel.released) &&
      !this.acquiringPromise
    ) {
      void this.acquire();
    }
  }

  /** Guards against overlapping request() calls: concurrent callers share one in-flight acquisition. */
  private acquire(): Promise<void> {
    if (this.acquiringPromise) return this.acquiringPromise;
    const promise = this.doAcquire().finally(() => {
      if (this.acquiringPromise === promise) this.acquiringPromise = null;
    });
    this.acquiringPromise = promise;
    return promise;
  }

  private async doAcquire(): Promise<void> {
    if (!this.navigatorLike.wakeLock) return; // feature not supported — silent no-op
    try {
      const sentinel = await this.navigatorLike.wakeLock.request('screen');
      if (!this.active) {
        // stop() ran while the request was in flight — release immediately, don't retain it.
        void sentinel.release().catch((err) => {
          console.error('WakeLockController: failed to release wake lock', err);
        });
        return;
      }
      this.sentinel = sentinel;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch (err) {
      // Acquisition can legitimately fail (e.g. low battery, backgrounded tab).
      // Logged, not thrown: wake lock is a best-effort UX enhancement.
      console.error('WakeLockController: failed to acquire wake lock', err);
    }
  }

  private async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (!sentinel || sentinel.released) return;
    try {
      await sentinel.release();
    } catch (err) {
      console.error('WakeLockController: failed to release wake lock', err);
    }
  }
}

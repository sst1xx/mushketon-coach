import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WakeLockController } from './wakeLockController';
import type { NavigatorLike, DocumentLike, WakeLockSentinelLike } from './wakeLockController';

function makeFakeSentinel(): WakeLockSentinelLike {
  return {
    released: false,
    addEventListener: vi.fn(),
    release: vi.fn(async function (this: WakeLockSentinelLike) { this.released = true; }),
  };
}

function makeFakeDocument(initial: 'visible' | 'hidden' = 'visible'): DocumentLike & { fire: () => void; visibilityState: 'visible' | 'hidden' } {
  let listener: (() => void) | null = null;
  return {
    visibilityState: initial,
    addEventListener: (_type, l) => { listener = l; },
    removeEventListener: (_type, l) => { if (listener === l) listener = null; },
    fire: () => listener?.(),
  };
}

describe('WakeLockController', () => {
  let sentinel: WakeLockSentinelLike;
  let requestMock: ReturnType<typeof vi.fn>;
  let navigatorLike: NavigatorLike;

  beforeEach(() => {
    sentinel = makeFakeSentinel();
    requestMock = vi.fn(async () => sentinel);
    navigatorLike = { wakeLock: { request: requestMock } };
  });

  it('start() requests a screen wake lock sentinel', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    expect(requestMock).toHaveBeenCalledWith('screen');
  });

  it('stop() releases the acquired sentinel', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    await controller.stop();
    expect(sentinel.release).toHaveBeenCalledTimes(1);
  });

  it('stop() is a no-op when nothing was acquired', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await expect(controller.stop()).resolves.toBeUndefined();
  });

  it('onVisibilityChange("hidden") does not re-acquire', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    requestMock.mockClear();
    controller.onVisibilityChange('hidden');
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('onVisibilityChange("visible") re-acquires after the sentinel was released', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    sentinel.released = true;
    requestMock.mockClear();
    controller.onVisibilityChange('visible');
    expect(requestMock).toHaveBeenCalledWith('screen');
  });

  it('re-acquires automatically via the visibilitychange listener bound in start()', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    sentinel.released = true;
    requestMock.mockClear();
    doc.visibilityState = 'visible';
    doc.fire();
    expect(requestMock).toHaveBeenCalledWith('screen');
  });

  it('stop() unsubscribes the visibilitychange listener', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    await controller.stop();
    requestMock.mockClear();
    doc.visibilityState = 'visible';
    doc.fire();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('falls back silently when navigator.wakeLock is unavailable', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController({}, doc);
    await expect(controller.start()).resolves.toBeUndefined();
    await expect(controller.stop()).resolves.toBeUndefined();
  });

  it('logs and does not throw when request() rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingRequest = vi.fn(async () => { throw new Error('denied'); });
    const doc = makeFakeDocument();
    const controller = new WakeLockController({ wakeLock: { request: failingRequest } }, doc);
    await expect(controller.start()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('releases the sentinel and does not retain it when stop() runs while start() is still awaiting request()', async () => {
    let resolveRequest: (s: WakeLockSentinelLike) => void;
    const pendingRequest = vi.fn(() => new Promise<WakeLockSentinelLike>((resolve) => { resolveRequest = resolve; }));
    const doc = makeFakeDocument();
    const controller = new WakeLockController({ wakeLock: { request: pendingRequest } }, doc);

    const startPromise = controller.start();
    await controller.stop();
    resolveRequest!(sentinel);
    await startPromise;

    expect(sentinel.release).toHaveBeenCalledTimes(1);

    // A later visibilitychange must not resurrect the stale lock: stop() already unsubscribed.
    requestMock.mockClear();
    doc.visibilityState = 'visible';
    doc.fire();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('does not subscribe a stale visibilitychange listener when stop() runs during the pending request()', async () => {
    let resolveRequest: (s: WakeLockSentinelLike) => void;
    const pendingRequest = vi.fn(() => new Promise<WakeLockSentinelLike>((resolve) => { resolveRequest = resolve; }));
    const doc = makeFakeDocument();
    const removeListenerSpy = vi.spyOn(doc, 'removeEventListener');
    const addListenerSpy = vi.spyOn(doc, 'addEventListener');
    const controller = new WakeLockController({ wakeLock: { request: pendingRequest } }, doc);

    const startPromise = controller.start();
    await controller.stop();
    resolveRequest!(sentinel);
    await startPromise;

    // stop() had nothing to unsubscribe (start() hadn't attached the listener yet),
    // and start() must not attach it after the fact once the session is inactive.
    expect(addListenerSpy).not.toHaveBeenCalled();
    expect(removeListenerSpy).not.toHaveBeenCalled();

    // Confirm no listener is live: firing a visibility event must not re-request.
    requestMock.mockClear();
    doc.visibilityState = 'visible';
    doc.fire();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('does not issue overlapping request() calls when onVisibilityChange fires twice before the first resolves', async () => {
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    // First acquisition succeeded via start(); simulate the sentinel being
    // released so a re-acquisition becomes eligible.
    sentinel.released = true;

    let resolveRequest: (s: WakeLockSentinelLike) => void;
    requestMock.mockImplementation(() => new Promise<WakeLockSentinelLike>((resolve) => { resolveRequest = resolve; }));
    requestMock.mockClear();

    controller.onVisibilityChange('visible');
    controller.onVisibilityChange('visible');

    expect(requestMock).toHaveBeenCalledTimes(1);

    resolveRequest!(sentinel);
    await Promise.resolve();
    await Promise.resolve();
  });

  it('logs and does not throw when release() rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    sentinel.release = vi.fn(async () => { throw new Error('release failed'); });
    const doc = makeFakeDocument();
    const controller = new WakeLockController(navigatorLike, doc);
    await controller.start();
    await expect(controller.stop()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

import { describe, it, expect } from 'vitest';
import { screenToTarget, targetToScreen } from './transform';

const rectSE    = { left: 0,  top: 0,  width: 375, height: 375 };
const rectA360  = { left: 0,  top: 0,  width: 360, height: 360 };
const rectWide  = { left: 10, top: 20, width: 400, height: 300 };

function roundtrip(px: number, py: number, rect: typeof rectSE) {
  const t = screenToTarget(px, py, rect)!;
  expect(t).not.toBeNull();
  const s = targetToScreen(t.xh, t.yh, rect);
  expect(Math.abs(s.px - px)).toBeLessThanOrEqual(1);
  expect(Math.abs(s.py - py)).toBeLessThanOrEqual(1);
}

describe('roundtrip', () => {
  it('center SE → (0,0)', () => {
    expect(screenToTarget(187.5, 187.5, rectSE)).toEqual({ xh: 0, yh: 0 });
  });
  it('center A360 → (0,0)', () => {
    expect(screenToTarget(180, 180, rectA360)).toEqual({ xh: 0, yh: 0 });
  });
  it('SE near center', () => roundtrip(200, 150, rectSE));
  it('SE quadrant', () => roundtrip(100, 100, rectSE));
  it('A360 near center', () => roundtrip(200, 160, rectA360));
  it('A360 quadrant', () => roundtrip(80, 280, rectA360));
  it('wide rect offset', () => roundtrip(110, 70, rectWide));
  it('wide rect other quadrant', () => roundtrip(350, 220, rectWide));
});

describe('Y-axis', () => {
  it('above center → positive yh', () => {
    expect(screenToTarget(187.5, 100, rectSE)!.yh).toBeGreaterThan(0);
  });
  it('below center → negative yh', () => {
    expect(screenToTarget(187.5, 280, rectSE)!.yh).toBeLessThan(0);
  });
});

describe('symmetry', () => {
  it('left/right symmetric', () => {
    const l = screenToTarget(100, 187.5, rectSE)!;
    const r = screenToTarget(275, 187.5, rectSE)!;
    expect(l.xh).toBe(-r.xh);
    expect(l.yh).toBe(0);
    expect(r.yh).toBe(0);
  });
});

describe('clamp', () => {
  it('corner of SE → null', () => {
    expect(screenToTarget(0, 0, rectSE)).toBeNull();
  });
  it('point beyond 80mm → null', () => {
    expect(screenToTarget(187.5 + 188, 187.5, rectSE)).toBeNull();
  });
});

describe('targetToScreen', () => {
  it('(0,0) → center SE', () => {
    const s = targetToScreen(0, 0, rectSE);
    expect(s.px).toBeCloseTo(187.5);
    expect(s.py).toBeCloseTo(187.5);
  });
  it('(0,0) → center wide offset rect', () => {
    const s = targetToScreen(0, 0, rectWide);
    expect(s.px).toBeCloseTo(210);
    expect(s.py).toBeCloseTo(170);
  });
});

import { describe, it, expect } from 'vitest';
import { getShotMarkerDims } from './TargetCanvas';

// ISSF 10 m air pistol target: ring boundary diameters (mm)
const RING_D: Record<number, number> = {
  1: 155.5, 2: 139.5, 3: 123.5, 4: 107.5,
  5: 91.5, 6: 75.5, 7: 59.5, 8: 43.5,
  9: 27.5, 10: 11.5,
};

const ZOOM7_SCALE = 80 / (RING_D[7] / 2); // ≈ 2.689

// Marker geometry constants mirrored from TargetCanvas (source of truth).
const MARKER_DIMS = {
  emphasis: { rInner: 4.55, rOuter: 5.2, fontSize: 3.64 },
  regular: { rInner: 3.64, rOuter: 4.29, fontSize: 3.12 },
} as const;

// Full-mode scale = inverse of zoom7 scale.
const FULL_SCALE = (RING_D[7] / 2) / 80;

describe('getShotMarkerDims — zoom7 mode', () => {
  it('keeps the current emphasis dimensions unchanged (screen-size regression guard)', () => {
    const dims = getShotMarkerDims('zoom7', true);
    expect(dims.rInner).toBeCloseTo(MARKER_DIMS.emphasis.rInner, 8);
    expect(dims.rOuter).toBeCloseTo(MARKER_DIMS.emphasis.rOuter, 8);
    expect(dims.fontSize).toBeCloseTo(MARKER_DIMS.emphasis.fontSize, 8);
  });

  it('keeps the current regular dimensions unchanged in zoom7', () => {
    const dims = getShotMarkerDims('zoom7', false);
    expect(dims.rInner).toBeCloseTo(MARKER_DIMS.regular.rInner, 8);
    expect(dims.rOuter).toBeCloseTo(MARKER_DIMS.regular.rOuter, 8);
    expect(dims.fontSize).toBeCloseTo(MARKER_DIMS.regular.fontSize, 8);
  });
});

describe('getShotMarkerDims — full mode', () => {
  it('scales emphasis dimensions down by full-mode factor', () => {
    const dims = getShotMarkerDims('full', true);
    expect(dims.rOuter).toBeCloseTo(MARKER_DIMS.emphasis.rOuter * FULL_SCALE, 8);
    expect(dims.rInner).toBeCloseTo(MARKER_DIMS.emphasis.rInner * FULL_SCALE, 8);
    expect(dims.fontSize).toBeCloseTo(MARKER_DIMS.emphasis.fontSize * FULL_SCALE, 8);
  });

  it('scales regular dimensions down by full-mode factor', () => {
    const dims = getShotMarkerDims('full', false);
    expect(dims.rOuter).toBeCloseTo(MARKER_DIMS.regular.rOuter * FULL_SCALE, 8);
    expect(dims.rInner).toBeCloseTo(MARKER_DIMS.regular.rInner * FULL_SCALE, 8);
    expect(dims.fontSize).toBeCloseTo(MARKER_DIMS.regular.fontSize * FULL_SCALE, 8);
  });

  it('marker in full mode does not cover the 10-ring (rOuter < ring-10 radius)', () => {
    const dims = getShotMarkerDims('full', true); // largest marker
    const ring10Radius = RING_D[10] / 2;
    expect(dims.rOuter).toBeLessThan(ring10Radius);
  });

  it('full-mode marker rOuter stays well under 5 (regression guard for oversized marker)', () => {
    const dims = getShotMarkerDims('full', true);
    expect(dims.rOuter).toBeLessThan(5);
  });
});

describe('getShotMarkerDims — mode consistency', () => {
  it('full-mode dims equal zoom7 dims divided by ZOOM7_SCALE', () => {
    for (const emphasis of [true, false]) {
      const full = getShotMarkerDims('full', emphasis);
      const zoom = getShotMarkerDims('zoom7', emphasis);
      expect(full.rOuter).toBeCloseTo(zoom.rOuter / ZOOM7_SCALE, 8);
      expect(full.rInner).toBeCloseTo(zoom.rInner / ZOOM7_SCALE, 8);
      expect(full.fontSize).toBeCloseTo(zoom.fontSize / ZOOM7_SCALE, 8);
    }
  });
});
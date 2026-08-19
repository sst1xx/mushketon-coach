import { describe, it, expect } from 'vitest';
import { computeRingLabels } from './TargetCanvas';

// ISSF 10 m air pistol target: ring boundary diameters (mm)
const RING_D: Record<number, number> = {
  1: 155.5, 2: 139.5, 3: 123.5, 4: 107.5,
  5: 91.5, 6: 75.5, 7: 59.5, 8: 43.5,
  9: 27.5, 10: 11.5,
};

const BLACK_ZONE_R = RING_D[7] / 2; // 29.75 mm — boundary of the black zone
const ZOOM7_SCALE = 80 / BLACK_ZONE_R;
const BLACK_ZONE_R_SCALED = BLACK_ZONE_R * ZOOM7_SCALE; // 80 in zoom

const LABEL_FONT_FULL = 3.5;
const LABEL_FONT_ZOOM7 = 5;
const VIEWBOX_HALF = 80; // viewBox is 0..160, center at 80

// Center of the 8 mm band between ring n and ring n+1
function bandCenter(n: number): number {
  return (RING_D[n] / 2 + RING_D[n + 1] / 2) / 2;
}

describe('computeRingLabels — full mode', () => {
  const labels = computeRingLabels('full');

  it('returns 9 labels 1–9 in order, with no ring 10', () => {
    expect(labels.map(l => l.n)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(labels.some(l => l.n === 10)).toBe(false);
  });

  it('places each label exactly at the center of its 8 mm band', () => {
    for (const l of labels) {
      expect(l.r).toBeCloseTo(bandCenter(l.n), 8);
    }
  });

  it('consecutive radii differ by exactly 8 mm (each band is 8 mm wide)', () => {
    for (let i = 0; i < labels.length - 1; i++) {
      const gap = Math.abs(labels[i].r - labels[i + 1].r);
      expect(gap).toBeCloseTo(8, 8);
    }
  });

  it('outermost label (ring 1) does not clip the viewBox (r + font <= 80)', () => {
    const maxR = Math.max(...labels.map(l => l.r));
    expect(maxR + LABEL_FONT_FULL).toBeLessThanOrEqual(VIEWBOX_HALF);
  });

  it('rings 7..9 are white (inside black zone); rings 1..6 are black (outside)', () => {
    for (const l of labels) {
      if (l.n >= 7) {
        expect(l.color).toBe('white');
        expect(l.r).toBeLessThan(BLACK_ZONE_R);
      } else {
        expect(l.color).toBe('black');
        expect(l.r).toBeGreaterThan(BLACK_ZONE_R);
      }
    }
  });
});

describe('computeRingLabels — zoom7 mode', () => {
  const labels = computeRingLabels('zoom7');

  it('returns 3 labels 9,8,7 in order, with no ring 10', () => {
    expect(labels.map(l => l.n)).toEqual([9, 8, 7]);
    expect(labels.some(l => l.n === 10)).toBe(false);
  });

  it('scales each band center by ZOOM7_SCALE', () => {
    for (const l of labels) {
      expect(l.r).toBeCloseTo(bandCenter(l.n) * ZOOM7_SCALE, 8);
    }
  });

  it('consecutive radii differ by exactly 8 mm after scaling', () => {
    const expectedGap = 8 * ZOOM7_SCALE;
    for (let i = 0; i < labels.length - 1; i++) {
      const gap = Math.abs(labels[i].r - labels[i + 1].r);
      expect(gap).toBeCloseTo(expectedGap, 8);
    }
  });

  it('outermost label (ring 7) does not clip the viewport (r + font <= 80)', () => {
    const maxR = Math.max(...labels.map(l => l.r));
    expect(maxR + LABEL_FONT_ZOOM7).toBeLessThanOrEqual(VIEWBOX_HALF);
  });

  it('all labels are white and inside the scaled black zone', () => {
    for (const l of labels) {
      expect(l.color).toBe('white');
      expect(l.r).toBeLessThan(BLACK_ZONE_R_SCALED);
    }
  });
});
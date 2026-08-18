import { describe, it, expect } from 'vitest';
import { score, SCORING_VERSION } from './scoring';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * For a boundary radius in µm, return the on-axis xh values:
 *   xh_on  = floor(R_µm / 10) → xu ≤ R_µm → inside or on boundary
 *   xh_out = floor(R_µm / 10) + 1 → xu > R_µm → outside boundary
 *
 * Note: Rk = 2250 + 575*k and Rm = 8000 + 800*m are always multiples of 25,
 * so xh_on * 10 ≤ R_µm and xh_out * 10 > R_µm (since step is 10 µm).
 */
function boundaryPair(R_µm: number): [xh_on: number, xh_out: number] {
  return [Math.floor(R_µm / 10), Math.floor(R_µm / 10) + 1];
}

/**
 * Compute the expected score for a given on-axis xu value using the
 * reference algorithm directly (no scoring.ts dependency) — used to
 * verify the "just outside" score when it may not be betterScore-1.
 */
function refScore(xu: number): number {
  const R2 = xu * xu;
  if (R2 <= 2250 * 2250) return 109;
  for (let k = 1; k <= 10; k++) {
    const Rk = 2250 + 575 * k;
    if (R2 <= Rk * Rk) return 109 - k;
  }
  for (let m = 1; m <= 90; m++) {
    const Rm = 8000 + 800 * m;
    if (R2 <= Rm * Rm) return 100 - m;
  }
  return 0;
}

// ─── SCORING_VERSION ─────────────────────────────────────────────────────────

describe('SCORING_VERSION', () => {
  it('equals 1', () => {
    expect(SCORING_VERSION).toBe(1);
  });
});

// ─── Center ──────────────────────────────────────────────────────────────────

describe('center', () => {
  it('(0, 0) → 109 (10.9)', () => {
    expect(score(0, 0)).toBe(109);
  });
});

// ─── Inner-ten boundary (R=2250µm) ───────────────────────────────────────────

describe('inner-ten boundary R=2250µm', () => {
  it('xh=225 (xu=2250) — on boundary → 109', () => {
    expect(score(225, 0)).toBe(109);
  });
  it('xh=226 (xu=2260) — just outside → 108', () => {
    // xu=2260 > 2250, and 2260 ≤ 2825=Rk1 → score=108
    expect(score(226, 0)).toBe(108);
  });
});

// ─── 10 inner-10 algorithm boundaries (k=1..10) ──────────────────────────────

describe('inner-10 algorithm boundaries (k=1..10)', () => {
  for (let k = 1; k <= 10; k++) {
    const Rk = 2250 + 575 * k;
    const betterScore = 109 - k;
    const [xh_on, xh_out] = boundaryPair(Rk);
    const outsideScore = refScore(xh_out * 10); // actual score just outside

    it(`k=${k}: Rk=${Rk}µm — on boundary xh=${xh_on} → ${betterScore}`, () => {
      expect(score(xh_on, 0)).toBe(betterScore);
    });

    it(`k=${k}: Rk=${Rk}µm — just outside xh=${xh_out} → ${outsideScore}`, () => {
      expect(score(xh_out, 0)).toBe(outsideScore);
    });
  }
});

// ─── 90 outer algorithm boundaries (m=1..90) ─────────────────────────────────

describe('outer algorithm boundaries (m=1..90)', () => {
  for (let m = 1; m <= 90; m++) {
    const Rm = 8000 + 800 * m;
    const betterScore = 100 - m;
    const [xh_on, xh_out] = boundaryPair(Rm);
    const outsideScore = refScore(xh_out * 10); // 0 when m=90

    it(`m=${m}: Rm=${Rm}µm — on boundary xh=${xh_on} → ${betterScore}`, () => {
      expect(score(xh_on, 0)).toBe(betterScore);
    });

    it(`m=${m}: Rm=${Rm}µm — just outside xh=${xh_out} → ${outsideScore}`, () => {
      expect(score(xh_out, 0)).toBe(outsideScore);
    });
  }
});

// ─── Miss ────────────────────────────────────────────────────────────────────

describe('miss', () => {
  it('xh=8001, yh=0 (r=80.01mm) → 0', () => {
    expect(score(8001, 0)).toBe(0);
  });
  it('xh=8000, yh=0 (r=80.00mm, m=90 boundary) → 10', () => {
    expect(score(8000, 0)).toBe(10);
  });
});

// ─── Symmetry ────────────────────────────────────────────────────────────────

describe('symmetry', () => {
  const samples: Array<[number, number]> = [
    [100, 0],
    [500, 0],
    [300, 400], // R=500 (Pythagorean triple)
    [600, 800], // R=1000
  ];

  for (const [xh, yh] of samples) {
    it(`score(${xh},${yh}) == score(-${xh},${yh}) == score(${xh},-${yh}) == score(-${xh},-${yh})`, () => {
      const base = score(xh, yh);
      expect(score(-xh, yh)).toBe(base);
      expect(score(xh, -yh)).toBe(base);
      expect(score(-xh, -yh)).toBe(base);
    });
  }

  it('score(100,0) === score(0,100) — x/y axis symmetry', () => {
    expect(score(0, 100)).toBe(score(100, 0));
  });

  it('score(500,0) === score(0,500) — x/y axis symmetry', () => {
    expect(score(0, 500)).toBe(score(500, 0));
  });
});

// ─── Spot checks ─────────────────────────────────────────────────────────────

describe('spot checks', () => {
  it('10.0→9.9: R just below Rk9=7425 → 100 (10.0)', () => {
    // Rk9 = 2250 + 575*9 = 7425 µm; xh=742 → xu=7420 ≤ 7425 → score=100
    expect(score(742, 0)).toBe(100);
  });

  it('10.0→9.9: R just above Rk9=7425 → 99 (9.9)', () => {
    // xh=743 → xu=7430 > 7425 → k=9 fails, k=10: 7430 ≤ 8000 → score=99
    expect(score(743, 0)).toBe(99);
  });

  it('9.9 zone spans Rk10 to Rm1 seamlessly', () => {
    // xh=840 → xu=8400 (between 8000 and 8800) → outer m=1 → score=99
    expect(score(840, 0)).toBe(99);
  });

  it('diagonal: score(300,400) uses R²=300²+400²=250000 (R=500µm)', () => {
    // xu=3000, yu=4000 µm, R²=9,000,000+16,000,000=25,000,000
    // Rk2=3400 µm; Rk2²=11,560,000 < 25,000,000
    // Rk3=3975 µm; Rk3²=15,800,625 < 25,000,000
    // Rk4=4550 µm; Rk4²=20,702,500 < 25,000,000
    // Rk5=5125 µm; Rk5²=26,265,625 ≥ 25,000,000 → score = 109-5 = 104
    expect(score(300, 400)).toBe(104);
  });
});

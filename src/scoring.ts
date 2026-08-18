/**
 * ISSF 10m Air Pistol decimal scoring module.
 *
 * Input:  xh, yh — integer hundredths of mm (range −8000..8000)
 * Output: integer tenths — 109 (=10.9) .. 10 (=1.0), or 0 (miss)
 *
 * Algorithm uses integer arithmetic only (no Math.sqrt, no floating point).
 */

export const SCORING_VERSION = 1;

/**
 * Compute ISSF decimal score for a shot at position (xh, yh).
 *
 * @param xh - X coordinate in integer hundredths of mm
 * @param yh - Y coordinate in integer hundredths of mm
 * @returns Integer tenths: 109..10, or 0 for miss
 */
export function score(xh: number, yh: number): number {
  // Convert to micrometers (1 hundredth mm = 10 µm)
  const xu = 10 * xh;
  const yu = 10 * yh;
  const R2 = xu * xu + yu * yu;

  // Inner-ten area: centre up to 2250 µm → 10.9
  const R_inner = 2250;
  if (R2 <= R_inner * R_inner) {
    return 109; // 10.9
  }

  // Inner 10 boundaries: Rk = 2250 + 575*k, k = 1..10
  // k=1 → boundary between 10.9 and 10.8 (tenths = 109 - 1 = 108)
  // k=10 → boundary between 10.0 and 9.9 (tenths = 109 - 10 = 99)
  for (let k = 1; k <= 10; k++) {
    const Rk = 2250 + 575 * k;
    if (R2 <= Rk * Rk) {
      return 109 - k;
    }
  }

  // Outer boundaries: Rm = 8000 + 800*m, m = 1..90
  // m=1 → boundary between 9.9 and 9.8 (tenths = 100 - 1 = 99)
  // Wait: after k=10 we have tenths=99. So m=1 gives tenths=100-1=99 too?
  // Let's check: k=10 gives boundary at Rk=2250+5750=8000 µm. tenths=99.
  // m=1 gives boundary at Rm=8000+800=8800 µm. tenths=100-1=99.
  // That's a gap from 8000 to 8800 that gives 99. That's correct: 
  //   9.9 zone spans Rk10=8000 to Rm1=8800.
  for (let m = 1; m <= 90; m++) {
    const Rm = 8000 + 800 * m;
    if (R2 <= Rm * Rm) {
      return 100 - m;
    }
  }

  // R > 80000 µm (80 mm) → miss
  return 0;
}

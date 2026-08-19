export interface TargetRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ScreenPoint { px: number; py: number; }
export interface TargetPoint { xh: number; yh: number; }

export function screenToTarget(px: number, py: number, rect: TargetRect): TargetPoint | null {
  const d = Math.min(rect.width, rect.height);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = px - cx;
  const dy = cy - py;
  const xh = Math.floor(dx * 16000 / d + 0.5);
  const yh = Math.floor(dy * 16000 / d + 0.5);
  if (xh * xh + yh * yh > 8000 * 8000) return null;
  return { xh, yh };
}

export function targetToScreen(xh: number, yh: number, rect: TargetRect): ScreenPoint {
  const d = Math.min(rect.width, rect.height);
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const factor = d / 16000;
  return { px: cx + xh * factor, py: cy - yh * factor };
}

import React from 'react';
import s from './TargetLoupe.module.css';

interface Props {
  /** Center of the crop, in the same SVG viewBox units as the main canvas. */
  centerPx: number;
  centerPy: number;
  /** Width/height (in viewBox units) of the cropped, magnified region. */
  cropSize: number;
  /** Pre-rendered ring/marker SVG children, reused unmodified from the main canvas. */
  children: React.ReactNode;
}

/**
 * HUD-level magnifier: renders the same target SVG content the main
 * TargetCanvas draws, cropped to a small region around the current touch
 * point and displayed above the finger so it is never occluded.
 * Pure presentational layer — does not touch transform.ts/scoring.ts.
 */
export default function TargetLoupe({ centerPx, centerPy, cropSize, children }: Props) {
  const half = cropSize / 2;
  return (
    <div className={s.loupe} aria-hidden="true">
      <svg
        className={s.svg}
        viewBox={`${centerPx - half} ${centerPy - half} ${cropSize} ${cropSize}`}
      >
        {children}
        <circle cx={centerPx} cy={centerPy} r={1} fill="none" stroke="var(--target-crosshair)" strokeWidth={0.5} />
        <line x1={centerPx - 3} y1={centerPy} x2={centerPx + 3} y2={centerPy} stroke="var(--target-crosshair)" strokeWidth={0.3} />
        <line x1={centerPx} y1={centerPy - 3} x2={centerPx} y2={centerPy + 3} stroke="var(--target-crosshair)" strokeWidth={0.3} />
      </svg>
    </div>
  );
}

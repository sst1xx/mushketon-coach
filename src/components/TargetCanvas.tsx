import React, { useRef, useCallback, useState, useEffect } from 'react';
import { screenToTarget, targetToScreen } from '../transform';
import type { ShotRecord } from '../db/schema';

const VIEW = 160; // viewBox size, 1 unit = 1mm
const CENTER = VIEW / 2; // 80
const SVG_TARGET_RECT = { left: 0, top: 0, width: VIEW, height: VIEW };
const HIT_RADIUS_PX = 24;

// Ring boundary diameters (mm)
const RING_D: Record<number, number> = {
  1: 155.5, 2: 139.5, 3: 123.5, 4: 107.5,
  5: 91.5, 6: 75.5, 7: 59.5, 8: 43.5,
  9: 27.5, 10: 11.5,
};

// Ring labels: each digit is centered in the 8 mm band between its own ring
// boundary and the next inner boundary. No ring 10 label is rendered.
const ZOOM7_SCALE = 80 / (RING_D[7] / 2);

// Shot markers keep their current screen size in zoom7; in full mode they are
// scaled down proportionally so they don't dominate the small rings.
const MARKER_SCALE = {
  full: (RING_D[7] / 2) / 80,
  zoom7: 1,
} as const;

// Base marker dimensions (emphasis = last shot or the one being dragged).
const MARKER_DIMS = {
  emphasis: { rInner: 4.55, rOuter: 5.2, fontSize: 3.64 },
  regular: { rInner: 3.64, rOuter: 4.29, fontSize: 3.12 },
} as const;

export type ZoomMode = 'full' | 'zoom7';

/** Pure helper mirroring computeRingLabels: marker geometry per zoom mode. */
export function getShotMarkerDims(
  zoomMode: ZoomMode,
  emphasis: boolean,
): { rInner: number; rOuter: number; fontSize: number } {
  const scale = MARKER_SCALE[zoomMode];
  const base = emphasis ? MARKER_DIMS.emphasis : MARKER_DIMS.regular;
  const dims = {
    rInner: base.rInner * scale,
    rOuter: base.rOuter * scale,
    fontSize: base.fontSize * scale,
  };
  return dims;
}

type LabelEntry = { n: number; r: number; color: 'white' | 'black' };

export function computeRingLabels(zoomMode: 'full' | 'zoom7'): LabelEntry[] {
  const scale = zoomMode === 'zoom7' ? ZOOM7_SCALE : 1;
  const ringNumbers = zoomMode === 'zoom7' ? [9, 8, 7] : [9, 8, 7, 6, 5, 4, 3, 2, 1];
  return ringNumbers.map(n => ({
    n,
    // Center of the band between ring n and ring n + 1
    r: ((RING_D[n] / 2 + RING_D[n + 1] / 2) / 2) * scale,
    color: n >= 7 ? 'white' : 'black',
  }));
}

const LABEL_FONT_FULL = 3.5;
const LABEL_FONT_ZOOM7 = 5;

// Label directions: all use centered anchors; the direction only changes the
// sign of the coordinate offset from the target center.
const LABEL_DIRS: Array<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

interface Props {
  shots: ShotRecord[];
  dragging: { shotId: string; xh: number; yh: number } | null;
  zoomMode: 'full' | 'zoom7';
  onDragStart: (shotId: string | null, xh: number, yh: number, isExisting: boolean) => void;
  onDragMove: (xh: number, yh: number) => void;
  onDragEnd: (xh: number, yh: number) => void;
  onDragCancel: () => void;
}

export default function TargetCanvas({
  shots,
  dragging,
  zoomMode,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);

  // ResizeObserver to determine the square size that fits the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setSize(Math.min(width, height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Zoom scale: makes the zoomed zone fill the full 80-unit radius of the viewBox
  const isZoom7 = zoomMode === 'zoom7';
  const ZOOM_SCALE = isZoom7 ? 80 / (RING_D[7] / 2) : 1;

  // Convert a pointer event's position to xh/yh target coords (descaled for zoom)
  const pointerToActualTarget = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const target = screenToTarget(clientX, clientY, rect);
    if (!target) return null;
    // Descale: convert scaled viewBox coords back to actual target coords
    if (ZOOM_SCALE === 1) return target;
    return { xh: Math.round(target.xh / ZOOM_SCALE), yh: Math.round(target.yh / ZOOM_SCALE) };
  }, [ZOOM_SCALE]);

  // Determine which shot (if any) is within hit radius, preferring nearest then highest shotNumber
  const findNearestShot = useCallback((clientX: number, clientY: number): ShotRecord | null => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    // Convert to SVG user coordinates
    const svgX = (clientX - rect.left) * VIEW / rect.width;
    const svgY = (clientY - rect.top) * VIEW / rect.height;
    // Convert mm to px for distance comparison
    const pxPerMm = rect.width / VIEW;
    let best: ShotRecord | null = null;
    let bestDist = Infinity;
    for (const shot of shots) {
      // Use the dragging target for the shot being dragged
      let shotXh = shot.x;
      let shotYh = shot.y;
      if (dragging && dragging.shotId === shot.id) {
        shotXh = dragging.xh;
        shotYh = dragging.yh;
      }
      // Scale shot coordinates for zoomed display
      const sp = targetToScreen(shotXh * ZOOM_SCALE, shotYh * ZOOM_SCALE, SVG_TARGET_RECT);
      const dx = sp.px - svgX;
      const dy = sp.py - svgY;
      const distPx = Math.sqrt(dx * dx + dy * dy) * pxPerMm;
      if (distPx <= HIT_RADIUS_PX) {
        if (distPx < bestDist ||
            (distPx === bestDist && best !== null && shot.shotNumber > best.shotNumber)) {
          bestDist = distPx;
          best = shot;
        }
      }
    }
    return best;
  }, [shots, dragging, ZOOM_SCALE]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle first active pointer
    if (dragging) return;
    const target = pointerToActualTarget(e.clientX, e.clientY);
    if (!target) return; // outside target circle
    const nearest = findNearestShot(e.clientX, e.clientY);
    if (nearest) {
      onDragStart(nearest.id, nearest.x, nearest.y, true);
    } else {
      onDragStart(null, target.xh, target.yh, false);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [dragging, pointerToActualTarget, findNearestShot, onDragStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const target = pointerToActualTarget(e.clientX, e.clientY);
    if (!target) return; // outside target — stay at last valid
    onDragMove(target.xh, target.yh);
  }, [dragging, pointerToActualTarget, onDragMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const target = pointerToActualTarget(e.clientX, e.clientY);
    if (target) {
      onDragEnd(target.xh, target.yh);
    } else {
      onDragEnd(dragging.xh, dragging.yh);
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, [dragging, pointerToActualTarget, onDragEnd]);

  const handlePointerCancel = useCallback(() => {
    if (!dragging) return;
    onDragCancel();
  }, [dragging, onDragCancel]);

  // Find last shot (highest shotNumber among non-dragging shots)
  const lastShot = (() => {
    const candidates = dragging
      ? shots.filter(s => s.id !== dragging.shotId)
      : shots;
    if (candidates.length === 0) return null;
    return candidates.reduce((a, b) => a.shotNumber > b.shotNumber ? a : b);
  })();

  const labelFont = isZoom7 ? LABEL_FONT_ZOOM7 : LABEL_FONT_FULL;
  const ringLabels = computeRingLabels(zoomMode);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        style={{
          width: size ? `${size}px` : '100%',
          height: size ? `${size}px` : '100%',
          maxWidth: '100%',
          maxHeight: '100%',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* 1. White background — always full viewBox radius */}
        <circle cx={CENTER} cy={CENTER} r={80} fill="white" stroke="#333" strokeWidth={0.4} />

        {/* 2. Black zone: solid black circle up to ring-7 boundary (scaled for zoom) */}
        <circle cx={CENTER} cy={CENTER} r={RING_D[7] / 2 * ZOOM_SCALE} fill="black" />

        {/* 3. Ring boundary lines (radii scaled by ZOOM_SCALE) */}
        {isZoom7 ? (
          <>
            {/* Zoom7: outer boundary at ring-7 (= full viewBox), inner boundaries for 8, 9, 10 */}
            {([8, 9] as const).map(n => (
              <circle key={n} cx={CENTER} cy={CENTER} r={RING_D[n] / 2 * ZOOM_SCALE}
                fill="none" stroke="white" strokeWidth={0.3} />
            ))}
            <circle cx={CENTER} cy={CENTER} r={RING_D[10] / 2 * ZOOM_SCALE}
              fill="none" stroke="white" strokeWidth={0.3} />
            <circle cx={CENTER} cy={CENTER} r={2.5 * ZOOM_SCALE} fill="white" />
          </>
        ) : (
          <>
            {/* Full: outer rings 1-6 (black stroke on white), inner 8-9 (white stroke on black) */}
            {([1, 2, 3, 4, 5, 6] as const).map(n => (
              <circle key={n} cx={CENTER} cy={CENTER} r={RING_D[n] / 2}
                fill="none" stroke="#333" strokeWidth={0.3} />
            ))}
            {([8, 9] as const).map(n => (
              <circle key={n} cx={CENTER} cy={CENTER} r={RING_D[n] / 2}
                fill="none" stroke="white" strokeWidth={0.3} />
            ))}
            <circle cx={CENTER} cy={CENTER} r={RING_D[10] / 2}
              fill="none" stroke="white" strokeWidth={0.3} />
            <circle cx={CENTER} cy={CENTER} r={2.5} fill="white" />
          </>
        )}

        {/* Ring labels (radii scaled for zoom) */}
        {ringLabels.map(({ n, r, color }) =>
          LABEL_DIRS.map(([dx, dy]) => (
            <text
              key={`${n}-${dx}-${dy}`}
              x={CENTER + dx * r}
              y={CENTER + dy * r}
              fontSize={labelFont}
              fill={color}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ userSelect: 'none', pointerEvents: 'none' }}
            >{n}</text>
          ))
        )}

        {/* Shot markers (coordinates scaled by ZOOM_SCALE for zoomed view) */}
        {shots.map(shot => {
          // Use dragging position if this is the shot being dragged
          const xh = dragging && dragging.shotId === shot.id ? dragging.xh : shot.x;
          const yh = dragging && dragging.shotId === shot.id ? dragging.yh : shot.y;
          // Scale for zoom display
          const sp = targetToScreen(xh * ZOOM_SCALE, yh * ZOOM_SCALE, SVG_TARGET_RECT);

          const isLast = lastShot !== null && shot.id === lastShot.id;
          const isDragging = dragging !== null && dragging.shotId === shot.id;
          const emphasis = isDragging || isLast;

          const { rInner, rOuter, fontSize } = getShotMarkerDims(zoomMode, emphasis);
          const fillColor = emphasis ? '#22C55E' : 'black';
          const strokeColor = 'white';
          const textFill = 'white';

          return (
            <g key={shot.id}>
              <circle cx={sp.px} cy={sp.py} r={rOuter} fill="none" stroke="white" strokeWidth={0.6} />
              <circle cx={sp.px} cy={sp.py} r={rInner} fill={fillColor} stroke={strokeColor} strokeWidth={0.25} />
              <text
                x={sp.px} y={sp.py}
                fontSize={fontSize}
                fill={textFill}
                textAnchor="middle"
                dominantBaseline="central"
                fontWeight="bold"
                style={{ userSelect: 'none', pointerEvents: 'none' }}
              >{shot.shotNumber}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

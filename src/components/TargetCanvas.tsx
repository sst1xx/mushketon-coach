import React, { useRef, useCallback, useState, useEffect } from 'react';
import { screenToTarget, targetToScreen } from '../transform';
import type { ShotRecord } from '../db/schema';

const VIEW = 160; // viewBox size, 1 unit = 1mm
const CENTER = VIEW / 2; // 80
const SVG_TARGET_RECT = { left: 0, top: 0, width: VIEW, height: VIEW };
const HIT_RADIUS_PX = 24;

// Ring diameters (mm), ring 1 (outermost, largest) to ring 10 (innermost)
const RING_DIAMETERS = [
    155.5, // ring 1
    139.5, // ring 2
    123.5, // ring 3
    107.5, // ring 4
     91.5, // ring 5
     75.5, // ring 6
     59.5, // ring 7
     43.5, // ring 8
     27.5, // ring 9
     11.5, // ring 10
];

interface Props {
  shots: ShotRecord[];
  dragging: { shotId: string; xh: number; yh: number } | null;
  onDragStart: (shotId: string | null, xh: number, yh: number, isExisting: boolean) => void;
  onDragMove: (xh: number, yh: number) => void;
  onDragEnd: (xh: number, yh: number) => void;
  onDragCancel: () => void;
}

export default function TargetCanvas({
  shots,
  dragging,
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

   // Convert a pointer event's position to xh/yh target coords
  const pointerToTarget = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return screenToTarget(clientX, clientY, rect);
   }, []);

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
      const sp = targetToScreen(shotXh, shotYh, SVG_TARGET_RECT);
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
   }, [shots, dragging]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
      // Only handle first active pointer
    if (dragging) return;
    const target = pointerToTarget(e.clientX, e.clientY);
    if (!target) return; // outside target circle
    const nearest = findNearestShot(e.clientX, e.clientY);
    if (nearest) {
      onDragStart(nearest.id, nearest.x, nearest.y, true);
     } else {
      onDragStart(null, target.xh, target.yh, false);
     }
    e.currentTarget.setPointerCapture(e.pointerId);
   }, [dragging, pointerToTarget, findNearestShot, onDragStart]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const target = pointerToTarget(e.clientX, e.clientY);
    if (!target) return; // outside target — stay at last valid
    onDragMove(target.xh, target.yh);
   }, [dragging, pointerToTarget, onDragMove]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const target = pointerToTarget(e.clientX, e.clientY);
    if (target) {
      onDragEnd(target.xh, target.yh);
     } else {
      onDragEnd(dragging.xh, dragging.yh);
     }
    e.currentTarget.releasePointerCapture(e.pointerId);
   }, [dragging, pointerToTarget, onDragEnd]);

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
         {/* Rings from outside in */}
         {RING_DIAMETERS.map((d, i) => {
          const r = d / 2;
          const ringNum = i + 1;
           // Ring 10 is black, alternating: even index = white, odd index = black
          const fill = i % 2 === 1 ? 'white' : 'black';
          return (
             <circle
              key={ringNum}
              cx={CENTER}
              cy={CENTER}
              r={r}
              fill={fill}
              strokeWidth={ringNum < RING_DIAMETERS.length ? 0.1 : undefined}
             />
           );
         })}

         {/* Shot markers */}
         {shots.map(shot => {
           // Use dragging position if this is the shot being dragged
          const xh = dragging && dragging.shotId === shot.id ? dragging.xh : shot.x;
          const yh = dragging && dragging.shotId === shot.id ? dragging.yh : shot.y;
          const sp = targetToScreen(xh, yh, SVG_TARGET_RECT);

          const isLast = lastShot !== null && shot.id === lastShot.id;
          const isDragging = dragging !== null && dragging.shotId === shot.id;

          if (isDragging) {
             // Dragging shot: large, highlighted with distinct fill
            return <circle key={shot.id} cx={sp.px} cy={sp.py} r={1.5} fill="red" stroke="white" strokeWidth={0.3} />;
           }
          if (isLast) {
             // Last committed shot: medium, different color
            return <circle key={shot.id} cx={sp.px} cy={sp.py} r={1.0} fill="#e74c3c" stroke="white" strokeWidth={0.2} />;
           }
           // Other shots: small, semi-transparent
          return <circle key={shot.id} cx={sp.px} cy={sp.py} r={0.7} fill="rgba(30,30,30,0.5)" />;
         })}
       </svg>
     </div>
   );
}

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
 5: 91.5,  6: 75.5,  7: 59.5,  8: 43.5,
 9: 27.5, 10: 11.5,
};

// Ring labels: ring number, label radius (mm from center), text color
const RING_LABELS_FULL = [
  { n: 9, r: RING_D[9]    / 2 + 2.5, color: 'white' as const },
  { n: 8, r: RING_D[8]    / 2 + 2.5, color: 'white' as const },
  { n: 7, r: RING_D[7]    / 2 + 2.5, color: 'white' as const },
  { n: 6, r: RING_D[6]    / 2 + 2.5, color: 'black' as const },
  { n: 5, r: RING_D[5]    / 2 + 2.5, color: 'black' as const },
  { n: 4, r: RING_D[4]    / 2 + 2.5, color: 'black' as const },
  { n: 3, r: RING_D[3]    / 2 + 2.5, color: 'black' as const },
  { n: 2, r: RING_D[2]    / 2 + 2.5, color: 'black' as const },
  { n: 1, r: RING_D[1]    / 2 + 2.5, color: 'black' as const },
];

const RING_LABELS_ZOOM7 = [
  { n: 10, r: RING_D[10] / 2 + 2.5, color: 'white' as const },
  { n: 9, r: RING_D[9]  / 2 + 2.5, color: 'white' as const },
  { n: 8, r: RING_D[8]  / 2 + 2.5, color: 'white' as const },
  { n: 7, r: RING_D[7]  / 2 + 2.5, color: 'white' as const },
];

// Label directions: [dx, dy, textAnchor, dominantBaseline]
const LABEL_DIRS: Array<[number, number, string, string]> = [
 [0, -1, 'middle', 'auto'],
 [0,   1, 'middle', 'hanging'],
 [-1, 0, 'end',     'middle'],
 [1,   0, 'start',   'middle'],
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

  // Determine outer radius and which rings to draw based on zoom mode
  const isZoom7 = zoomMode === 'zoom7';
  const outerRadius = isZoom7 ? RING_D[7] / 2 : 80;
  const ringLabels = isZoom7 ? RING_LABELS_ZOOM7 : RING_LABELS_FULL;

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
           {/* 1. White background */}
           <circle cx={CENTER} cy={CENTER} r={outerRadius} fill="white" stroke="#333" strokeWidth={0.4} />

           {/* 2. Black zone: solid black circle up to ring-7 boundary */}
           <circle cx={CENTER} cy={CENTER} r={RING_D[7] / 2} fill={isZoom7 ? 'none' : 'black'} />

           {/* 3. Ring boundary lines */}
           {isZoom7 ? (
             <>
               {/* Zoom7: outer boundary at ring-7, inner boundaries for 8, 9, 10 */}
               {([8, 9] as const).map(n => (
                 <circle key={n} cx={CENTER} cy={CENTER} r={RING_D[n] / 2}
                 fill="none" stroke="white" strokeWidth={0.3} />
               ))}
               <circle cx={CENTER} cy={CENTER} r={RING_D[10] / 2}
               fill="none" stroke="white" strokeWidth={0.3} />
               <circle cx={CENTER} cy={CENTER} r={2.5} fill="white" />
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

           {/* Ring labels */}
           {ringLabels.map(({ n, r, color }) =>
            LABEL_DIRS.map(([dx, dy, anchor, baseline]) => (
               <text
                key={`${n}-${dx}-${dy}`}
                x={CENTER + dx * r}
                y={CENTER + dy * r}
                fontSize={3.5}
                fill={color}
                textAnchor={anchor}
                dominantBaseline={baseline}
                style={{ userSelect: 'none', pointerEvents: 'none' }}
               >{n}</text>
             ))
           )}

           {/* Shot markers */}
           {shots.map(shot => {
             // Use dragging position if this is the shot being dragged
          const xh = dragging && dragging.shotId === shot.id ? dragging.xh : shot.x;
          const yh = dragging && dragging.shotId === shot.id ? dragging.yh : shot.y;
          const sp = targetToScreen(xh, yh, SVG_TARGET_RECT);

          const isLast = lastShot !== null && shot.id === lastShot.id;
          const isDragging = dragging !== null && dragging.shotId === shot.id;

          if (isDragging) {
                 // Double stroke for max visibility: outer black, inner orange
            return <>
                 <circle key={shot.id + '-outer'} cx={sp.px} cy={sp.py} r={1.8} fill="none" stroke="black" strokeWidth={0.6} />
                 <circle key={shot.id} cx={sp.px} cy={sp.py} r={1.8} fill="#FF6B00" stroke="white" strokeWidth={0.3} />
               </>;
            }
          if (isLast) {
                 // Double stroke for max visibility: outer black, inner gold
            return <>
                 <circle key={shot.id + '-outer'} cx={sp.px} cy={sp.py} r={1.2} fill="none" stroke="black" strokeWidth={0.5} />
                 <circle key={shot.id} cx={sp.px} cy={sp.py} r={1.2} fill="#FFD700" stroke="white" strokeWidth={0.25} />
               </>;
            }
               // Double stroke for max visibility: outer black, inner white
          return <>
                 <circle key={shot.id + '-outer'} cx={sp.px} cy={sp.py} r={0.9} fill="none" stroke="black" strokeWidth={0.4} />
                 <circle key={shot.id} cx={sp.px} cy={sp.py} r={0.9} fill="white" stroke="black" strokeWidth={0.2} />
               </>;
           })}
         </svg>
       </div>
     );
}

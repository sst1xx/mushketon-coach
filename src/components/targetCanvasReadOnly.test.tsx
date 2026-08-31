import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TargetCanvas from './TargetCanvas';

type Props = React.ComponentProps<typeof TargetCanvas>;

const shots: Props['shots'] = [
  { id: 's1', trainingId: 't1', shotNumber: 1, x: 0, y: 0, score: 90, status: 'committed', createdAt: '', updatedAt: '' },
  { id: 's2', trainingId: 't1', shotNumber: 1, x: 100, y: 100, score: 95, status: 'committed', createdAt: '', updatedAt: '' },
];

interface CircleTag {
  attrs: Record<string, string>;
}

function extractCircles(markup: string): CircleTag[] {
  const tags: CircleTag[] = [];
  const re = /<circle\b([^>]*?)\/?\s*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRe = /(\S+?)="([^"]*)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(m[1])) !== null) {
      attrs[am[1]] = am[2];
    }
    tags.push({ attrs });
  }
  return tags;
}

describe('TargetCanvas readOnly rendering', () => {
  it('renders shots without TargetLoupe markup (no drag) and without crosshair', () => {
    const markup = renderToStaticMarkup(
      <TargetCanvas
        shots={shots}
        dragging={null}
        zoomMode="full"
        readOnly
      />,
    );
    expect(markup).not.toContain('e11d48'); // no crosshair
    const circles = extractCircles(markup);
    const innerCircles = circles.filter(c => c.attrs['stroke-width'] === '0.25');
    expect(innerCircles).toHaveLength(2);
  });

  it('fills a commented shot marker blue and an uncommented shot black', () => {
    const markup = renderToStaticMarkup(
      <TargetCanvas
        shots={shots}
        dragging={null}
        zoomMode="full"
        readOnly
        commentedShotIds={new Set(['s1'])}
      />,
    );
    const circles = extractCircles(markup);
    const innerCircles = circles.filter(c => c.attrs['stroke-width'] === '0.25');
    expect(innerCircles[0].attrs.fill).toBe('var(--target-shot-selected-fill)');
    expect(innerCircles[1].attrs.fill).toBe('var(--target-shot-regular-fill)');
  });

  it('renders a <title> tooltip only for a shot with tooltip text', () => {
    const markup = renderToStaticMarkup(
      <TargetCanvas
        shots={shots}
        dragging={null}
        zoomMode="full"
        readOnly
        shotTooltip={(id) => (id === 's1' ? 'Дёрнул спуск' : null)}
      />,
    );
    expect(markup).toContain('<title>Дёрнул спуск</title>');
    expect(markup.match(/<title>/g)?.length ?? 0).toBe(1);
  });

  it('renders the provided shotLabels number instead of shotNumber, and omits label when absent from the map', () => {
    const markup = renderToStaticMarkup(
      <TargetCanvas
        shots={shots}
        dragging={null}
        zoomMode="full"
        readOnly
        shotLabels={new Map([['s1', 42]])}
      />,
    );
    expect(markup).toContain('>42<');
    // s2 has shotNumber 1 but is absent from shotLabels — no "1" marker label should be
    // rendered (marker text uses font-weight="bold"; ring labels use "1" too but never bold).
    const boldTexts = [...markup.matchAll(/<text\b([^>]*)>([^<]*)<\/text>/g)]
      .filter((m) => m[1].includes('font-weight="bold"'))
      .map((m) => m[2]);
    expect(boldTexts).not.toContain('1');
  });
});

// ─── readOnly pointerDown logic, exercised via handlePointerDown ──────────────
//
// The project's test stack has no DOM environment and no `@testing-library/*`
// (see PLAN-ALL-SHOTS.md §4.4) so `TargetCanvas` cannot be mounted and driven
// with real `PointerEvent`s. `TargetCanvas` only reads `hooks` (`useRef`,
// `useCallback`) to build `handlePointerDown`, with no effects and no state
// read by that handler, so it can be invoked directly by calling the function
// component under a minimal hand-rolled hooks dispatcher (React's supported
// mechanism for providing a dispatcher — used here only to avoid adding a
// renderer dependency). `svgRef.current` is then set by hand to a fake
// element exposing `getBoundingClientRect`, mirroring what React would have
// attached to the real `<svg ref={svgRef}>` after mounting.
const ReactInternals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentDispatcher: { current: unknown } };
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function renderWithFakeDispatcher<T>(render: () => T): { result: T; refs: Array<{ current: unknown }> } {
  const refs: Array<{ current: unknown }> = [];
  const fakeDispatcher = {
    useRef: (initial: unknown) => {
      const ref = { current: initial };
      refs.push(ref);
      return ref;
    },
    useCallback: (fn: unknown) => fn,
  };
  const prevDispatcher = ReactInternals.ReactCurrentDispatcher.current;
  ReactInternals.ReactCurrentDispatcher.current = fakeDispatcher;
  try {
    return { result: render(), refs };
  } finally {
    ReactInternals.ReactCurrentDispatcher.current = prevDispatcher;
  }
}

function getOnPointerDown(props: Props, rectPx: { left: number; top: number; width: number; height: number }) {
  const { result: element, refs } = renderWithFakeDispatcher(() =>
    (TargetCanvas as unknown as (p: Props) => React.ReactElement)(props),
  );
  // First useRef() call in TargetCanvas is svgRef.
  refs[0].current = { getBoundingClientRect: () => rectPx };
  const svg = element.props.children[0];
  return svg.props.onPointerDown as (e: React.PointerEvent) => void;
}

describe('TargetCanvas readOnly pointer handling (direct handler call)', () => {
  const rectPx = { left: 0, top: 0, width: 160, height: 160 }; // 1 CSS px == 1 viewBox unit

  it('calls onSelectShot with the nearest shot id and does not call onDragStart when hitting a shot', () => {
    const onSelectShot = vi.fn();
    const onDragStart = vi.fn();
    const props: Props = {
      shots: [{ id: 's1', trainingId: 't1', shotNumber: 1, x: 0, y: 0, score: 90, status: 'committed', createdAt: '', updatedAt: '' }],
      dragging: null,
      zoomMode: 'full',
      readOnly: true,
      onSelectShot,
      onDragStart,
    };
    const onPointerDown = getOnPointerDown(props, rectPx);
    // Target center (x=0,y=0) maps to the middle of the 160x160 viewBox.
    onPointerDown({ clientX: 80, clientY: 80, pointerId: 1 } as unknown as React.PointerEvent);
    expect(onSelectShot).toHaveBeenCalledWith('s1');
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('does not call onSelectShot or onDragStart when pointerDown misses all shots', () => {
    const onSelectShot = vi.fn();
    const onDragStart = vi.fn();
    const props: Props = {
      shots: [{ id: 's1', trainingId: 't1', shotNumber: 1, x: 7000, y: 7000, score: 90, status: 'committed', createdAt: '', updatedAt: '' }],
      dragging: null,
      zoomMode: 'full',
      readOnly: true,
      onSelectShot,
      onDragStart,
    };
    const onPointerDown = getOnPointerDown(props, rectPx);
    onPointerDown({ clientX: 80, clientY: 80, pointerId: 1 } as unknown as React.PointerEvent);
    expect(onSelectShot).not.toHaveBeenCalled();
    expect(onDragStart).not.toHaveBeenCalled();
  });
});

// ─── readOnly marker-level pointerDown (regression: tap on a commented shot) ──
//
// Bug report: tapping a commented (blue) shot marker on AllShotsScreen did
// nothing. Root cause: only the <svg>-level distance hit test
// (handlePointerDown above) drove selection; a commented marker's own <title>
// child changes native pointer/tooltip handling on some touch browsers
// (WebKit two-tap-for-title quirk) enough to prevent that svg-level tap from
// registering reliably. Fix: each marker's own <g> now gets a direct
// onPointerDown in readOnly mode that selects it and stops propagation,
// independent of the title child and of the svg-level distance calculation.
// Exercised the same way as the svg-level handler above: call the component
// function directly (no DOM) and pull the handler off the marker element in
// the returned tree.
function getMarkerPointerDownHandlers(props: Props, rectPx: { left: number; top: number; width: number; height: number }) {
  const { result: element, refs } = renderWithFakeDispatcher(() =>
    (TargetCanvas as unknown as (p: Props) => React.ReactElement)(props),
  );
  refs[0].current = { getBoundingClientRect: () => rectPx };
  const svg = element.props.children[0];
  const markerElements = svg.props.children[1] as React.ReactElement[];
  const byShotId = new Map<string, ((e: React.PointerEvent) => void) | undefined>();
  for (const marker of markerElements) {
    byShotId.set(marker.key as string, marker.props.onPointerDown);
  }
  return byShotId;
}

describe('TargetCanvas readOnly marker pointerDown (direct handler call)', () => {
  const rectPx = { left: 0, top: 0, width: 160, height: 160 };

  it('selects a commented (blue, tooltip-bearing) shot when its own marker receives pointerDown', () => {
    const onSelectShot = vi.fn();
    const props: Props = {
      shots,
      dragging: null,
      zoomMode: 'full',
      readOnly: true,
      onSelectShot,
      commentedShotIds: new Set(['s1']),
      shotTooltip: (id) => (id === 's1' ? 'Дёрнул спуск' : null),
    };
    const handlers = getMarkerPointerDownHandlers(props, rectPx);
    const stopPropagation = vi.fn();
    handlers.get('s1')?.({ stopPropagation } as unknown as React.PointerEvent);
    expect(onSelectShot).toHaveBeenCalledWith('s1');
    expect(stopPropagation).toHaveBeenCalled();
  });

  it('selects an uncommented shot the same way when its marker receives pointerDown', () => {
    const onSelectShot = vi.fn();
    const props: Props = {
      shots,
      dragging: null,
      zoomMode: 'full',
      readOnly: true,
      onSelectShot,
    };
    const handlers = getMarkerPointerDownHandlers(props, rectPx);
    const stopPropagation = vi.fn();
    handlers.get('s2')?.({ stopPropagation } as unknown as React.PointerEvent);
    expect(onSelectShot).toHaveBeenCalledWith('s2');
  });

  it('does not attach a marker onPointerDown handler outside readOnly mode', () => {
    const props: Props = {
      shots,
      dragging: null,
      zoomMode: 'full',
      readOnly: false,
    };
    const handlers = getMarkerPointerDownHandlers(props, rectPx);
    expect(handlers.get('s1')).toBeUndefined();
  });
});

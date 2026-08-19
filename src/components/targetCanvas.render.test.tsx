import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TargetCanvas from './TargetCanvas';

const noop = () => undefined;

type Props = React.ComponentProps<typeof TargetCanvas>;

function renderMarkup(zoomMode: 'full' | 'zoom7'): string {
  return renderMarkupWithShots(zoomMode, []);
}

/** Render with a single committed shot so a shot marker is present. */
function renderMarkupWithShot(zoomMode: 'full' | 'zoom7'): string {
  const props: Props = {
    shots: [{
      id: 's1', trainingId: 't1', shotNumber: 1, x: 0, y: 0, score: 105,
      status: 'committed', createdAt: '', updatedAt: '',
    }],
    dragging: null,
    zoomMode,
    onDragStart: noop,
    onDragMove: noop,
    onDragEnd: noop,
    onDragCancel: noop,
  };
  return renderToStaticMarkup(<TargetCanvas {...props} />);
}

function renderMarkupWithShots(zoomMode: 'full' | 'zoom7', shots: Props['shots']): string {
  const props: Props = {
    shots,
    dragging: null,
    zoomMode,
    onDragStart: noop,
    onDragMove: noop,
    onDragEnd: noop,
    onDragCancel: noop,
  };
  return renderToStaticMarkup(<TargetCanvas {...props} />);
}

interface TextTag {
  attrs: Record<string, string>;
  content: string;
}

/** Extract all <text> elements: attributes map + text content. */
function extractTexts(markup: string): TextTag[] {
  const tags: TextTag[] = [];
  const re = /<text\b([^>]*)>([^<]*)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markup)) !== null) {
    const attrs: Record<string, string> = {};
    const attrRe = /(\S+?)="([^"]*)"/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(m[1])) !== null) {
      attrs[am[1]] = am[2];
    }
    tags.push({ attrs, content: m[2] });
  }
  return tags;
}

interface CircleTag {
  attrs: Record<string, string>;
}

/** Extract all <circle> elements as attribute maps. */
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

/** Shot-marker outer ring is the unique circle with strokeWidth 0.6. */
function markerOuterCircles(circles: CircleTag[]): CircleTag[] {
  return circles.filter(c => c.attrs['stroke-width'] === '0.6');
}

// Full-mode marker scale factor (inverse of zoom7 scale).
const FULL_MARKER_SCALE = 29.75 / 80; // (RING_D[7]/2) / 80

describe('TargetCanvas shot marker size — full mode (render)', () => {
  const circles = markerOuterCircles(extractCircles(renderMarkupWithShot('full')));

  it('renders exactly one shot marker outer circle', () => {
    expect(circles).toHaveLength(1);
  });

  it('marker radius is scaled down for full mode', () => {
    // Emphasis marker (last & only shot): r = 5.2 * full scale ≈ 1.93
    expect(Number(circles[0].attrs.r)).toBeCloseTo(5.2 * FULL_MARKER_SCALE, 2);
    expect(Number(circles[0].attrs.r)).toBeLessThan(5);
  });
});

describe('TargetCanvas shot marker — zoom7 mode (render)', () => {
  const circles = markerOuterCircles(extractCircles(renderMarkupWithShot('zoom7')));

  it('renders exactly one shot marker outer circle', () => {
    expect(circles).toHaveLength(1);
  });

  it('marker keeps the current emphasis radius in zoom7', () => {
    expect(Number(circles[0].attrs.r)).toBeCloseTo(5.2, 2);
  });
});

describe('TargetCanvas ring labels — full mode (render)', () => {
  const texts = extractTexts(renderMarkup('full'));

  it('each ring number 1..9 renders exactly once per direction (4 total)', () => {
    for (let n = 1; n <= 9; n++) {
      expect(texts.filter(t => t.content === String(n))).toHaveLength(4);
    }
  });

  it('ring 10 has no label', () => {
    expect(texts.some(t => t.content === '10')).toBe(false);
  });

  it('all labels use centered anchors', () => {
    for (const t of texts) {
      expect(t.attrs['text-anchor']).toBe('middle');
      expect(t.attrs['dominant-baseline']).toBe('central');
    }
  });

  it('the four occurrences of each number are at four directions', () => {
    for (let n = 1; n <= 9; n++) {
      const positions = texts
        .filter(t => t.content === String(n))
        .map(t => `${t.attrs.x},${t.attrs.y}`)
        .sort();
      expect(new Set(positions).size).toBe(4);
    }
  });
});

describe('TargetCanvas ring labels — zoom7 mode (render)', () => {
  const texts = extractTexts(renderMarkup('zoom7'));

  it('each ring number 7..9 renders once per direction, no ring 10', () => {
    for (let n = 7; n <= 9; n++) {
      expect(texts.filter(t => t.content === String(n))).toHaveLength(4);
    }
    expect(texts.some(t => t.content === '10')).toBe(false);
  });

  it('all labels use centered anchors', () => {
    for (const t of texts) {
      expect(t.attrs['text-anchor']).toBe('middle');
      expect(t.attrs['dominant-baseline']).toBe('central');
    }
  });
});

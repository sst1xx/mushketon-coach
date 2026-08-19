import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TargetCanvas from './TargetCanvas';

const noop = () => undefined;

type Props = React.ComponentProps<typeof TargetCanvas>;

function renderMarkup(zoomMode: 'full' | 'zoom7'): string {
  const props: Props = {
    shots: [],
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

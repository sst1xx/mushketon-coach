import React, { useEffect, useRef } from 'react';
import { ShotRecord } from '../db/schema';
import { shotListLabel } from '../screens/shotListLabel';
import s from './ShotsList.module.css';

interface Props {
  shots: ShotRecord[];
  /**
   * Which column of the two-column phone layout this instance renders, or `all`
   * for the single ordered desktop sidebar list. Committed shots for `left`/`right`
   * are split sequentially: the left column takes the first half (rounded up), the
   * right column takes the rest, so shots read left-to-right, top-to-bottom like a
   * scorecard (e.g. 10 shots → left №1–5, right №6–10). A shot's column can shift as
   * later shots are appended (the split point moves), which is expected for a
   * sequential fill. `all` renders every committed shot in ascending order, unfiltered.
   */
  side: 'left' | 'right' | 'all';
}

/**
 * Display-only history of committed shots for the current training. On phone width
 * it renders one column of a two-column table flanking the current score display;
 * on desktop width (`side="all"`) it renders the full ordered list as a sidebar next
 * to the target (see PLAN-TRAINING-SHOT-LIST.md). Not interactive — tapping a row
 * does not select a shot or change the current score.
 */
export default function ShotsList({ shots, side }: Props) {
  const committed = shots.filter(shot => shot.status === 'committed');
  const splitPoint = Math.ceil(committed.length / 2);
  const items =
    side === 'all' ? committed : side === 'left' ? committed.slice(0, splitPoint) : committed.slice(splitPoint);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const last = el.lastElementChild as HTMLElement | null;
    last?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [items.length]);

  return (
    <ul className={s.list} ref={listRef}>
      {items.map(shot => (
        <li key={shot.id} className={s.item}>
          {shotListLabel(shot.shotNumber, shot.score)}
        </li>
      ))}
    </ul>
  );
}

# PLAN — Training shot history list

## Problem

Coach needs to see the shot history (number + result) of the current training while
shooting, without leaving `TrainingScreen`. Must work on phone (small viewport, target
size is priority) and on a wide screen / desktop browser used to check the app.

## Scope

- New presentational component `src/components/ShotsList.tsx` + `ShotsList.module.css`.
- New pure formatter `src/screens/shotListLabel.ts` (+ unit test) producing the
  `№17 • 10.4` label, reusing the same shape as the existing commit toast in
  `TrainingScreen.tsx`, without touching that toast's own inline formatting.
- `TrainingScreen.tsx` renders `<ShotsList>` fed with `shots` already loaded/committed
  in existing state — no new repo/domain calls.
- Layout: CSS-only breakpoint switches from a mobile compact strip to a desktop
  sidebar. No JS device/viewport detection.

## Explicitly out of scope

- No change to `src/scoring.ts` or `src/transform.ts`.
- No new dependencies.
- No change to other screens (`AthletesScreen`, `TrainingsScreen`, `RemarksScreen`,
  `SettingsScreen`) and no change to the project's mobile-first/portrait-first default
  — this is a narrow, additive revision scoped to `TrainingScreen` only: an extra
  desktop-width layout branch for this one screen, not a general responsive redesign.
- No row interactivity: the list is **display-only**. Tapping/clicking a row does not
  select a shot, does not open a comment, does not change `displayScore`. Rationale:
  the existing "selected shot" concept already drives editing/comment target via the
  target canvas and drag interactions; wiring the list into that would silently change
  what a tap edits/comments, which is a product decision outside this task's scope.

## Data / filtering rules

- Show only shots with `status === 'committed'`.
- Order ascending by `shotNumber` (matches `listShots()` return order already).
- Draft shot (currently being dragged) is never shown in the list — no `—` placeholder
  row for it.
- Miss (`score === 0`) renders as `0.0`, matching existing toast behavior.

## Label format

`src/screens/shotListLabel.ts`:

```ts
export function shotListLabel(shotNumber: number, score: number): string {
  const scoreLabel = score > 0 ? (score / 10).toFixed(1) : '0.0';
  return `№${shotNumber} • ${scoreLabel}`;
}
```

Unit test file `src/screens/shotListLabel.test.ts` covers: normal score (e.g. 105 →
`10.5`), miss (`0` → `0.0`), and a small shotNumber.

This does not touch the existing inline toast formatting in `TrainingScreen.tsx`
(`setToast` call) — that stays as-is per "existing places of formatting are not
refactored".

## Component

`ShotsList` props: `{ shots: ShotRecord[] }`. Internally filters/sorts nothing — the
caller (`TrainingScreen`) is expected to pass already-loaded shots; the component
itself filters to `committed` and keeps the given order (already ascending from
`listShots`). Renders a `<ul>` of `<li>` with the formatted label, one per commited
shot. No `onClick`, no `tabIndex`, no interactive semantics — purely list markup.

Auto-scroll: on shots length change, scroll the list container so the last committed
shot is visible (`ref` + `useEffect`, `scrollIntoView`/`scrollLeft` set based on the
last child's offset). No new dependency; guarded to run only when a `ref` element is
attached (tests use `renderToStaticMarkup`, no DOM, so the effect body must not throw
under jsdom-less rendering — using `useEffect`, which React server-rendering already
skips, avoids that.)

## Layout

`TrainingScreen.module.css` `.page` becomes a CSS grid instead of a flex column, to
allow the shot list to move from "compact strip below score" (mobile) to "sidebar next
to the target" (desktop) using only a media query — no JS branching.

Mobile (default, portrait-first, unchanged priority: target gets the most vertical
space):

```
grid-template-columns: 1fr;
grid-template-areas:
  "header"
  "banner"
  "target"
  "score"
  "list"
  "toolbar";
grid-template-rows: auto auto minmax(0, 1fr) auto auto auto;
```

`.shotsList` (mobile): `display: flex; flex-direction: row; overflow-x: auto;
overflow-y: hidden; max-height: 36px;` — a single horizontally scrollable strip, kept
short so it does not meaningfully shrink the target area (which keeps its `1fr` grid
row and `min-height: 0` on `.targetWrap` so it can still shrink itself in a small
viewport, as before).

Desktop (`@media (min-width: 900px)`):

```
grid-template-columns: 1fr 280px;
grid-template-areas:
  "header header"
  "banner banner"
  "target list"
  "score  list"
  "toolbar list";
grid-template-rows: auto auto minmax(0, 1fr) auto auto;
```

`.shotsList` at this breakpoint switches to `flex-direction: column; overflow-y: auto;
overflow-x: hidden; max-height: none;` (sidebar spans target+score+toolbar rows,
capped at `280px` wide, internal vertical scroll for long trainings).

The target's grid area/column keeps `min-height: 0` (already applied to
`.targetWrap`) so a tall shot list on desktop cannot push the target out of view — the
grid row sizing (`minmax(0, 1fr)`) already caps its share, this note just makes the
existing rule explicit per review.

No `Modal` fallback for the mobile strip: 36px is a fixed, small budget that does not
depend on content, so there is no dynamic case where the strip needs to be replaced by
a modal. (If a future task wants a full-history modal, that is new scope, not covered
here.)

## Testing

- `src/screens/shotListLabel.test.ts` — new unit tests for the formatter.
- `src/components/shotsList.render.test.tsx` — render test (renderToStaticMarkup,
  following `targetCanvas.render.test.tsx` conventions) asserting: committed shots
  render with the right label text, non-committed/draft shots are excluded, empty
  list renders no `<li>`.
- Existing `npx vitest run` suite (373 tests / 15 files as of this branch) must stay
  green; `npm run build` must type-check cleanly.

## Files touched

- `src/components/ShotsList.tsx` (new)
- `src/components/ShotsList.module.css` (new)
- `src/components/shotsList.render.test.tsx` (new)
- `src/screens/shotListLabel.ts` (new)
- `src/screens/shotListLabel.test.ts` (new)
- `src/screens/TrainingScreen.tsx` (render `<ShotsList>`)
- `src/screens/TrainingScreen.module.css` (grid layout change)

## Update — two-column phone-first layout with totals row

Follow-up revision, driven by an explicit phone-first request: fit the shot history
on a phone by presenting it as a two-column table flanking the large current-score
digit, with a final row showing the training total.

### Layout change

`ShotsList` no longer renders a single strip/sidebar. It now takes a required
`side: 'left' | 'right'` prop and renders only that column's items. Committed shots
are split by **array index parity** (0-based even index → left, odd → right), so a
given shot's column assignment is permanent — it never jumps column as later shots
are appended (unlike a first-half/second-half split, which would move shots between
columns as the training grows).

`TrainingScreen` mounts `<ShotsList side="left">` and `<ShotsList side="right">` as
two siblings of the score digit inside the same CSS Grid row, so the big score sits
physically between the two shot columns:

```
grid-template-columns: 84px 1fr 84px;   /* desktop: 200px 1fr 200px */
grid-template-areas:
  ...
  "listL  score listR"
  "total  total total"
  ...
```

This single layout is now used at all viewport widths — phone is the priority target
(narrow fixed side columns), and the `@media (min-width: 900px)` breakpoint only
widens the two side columns (84px → 200px) for a more comfortable desktop read. The
previous desktop-only 280px full-height sidebar (single ordered list to the right of
the target) is replaced by this symmetric two-column layout at every width — this is
a deliberate simplification of the desktop variant, not a preserved pixel-identical
copy of the original desktop sidebar, in exchange for one shared layout instead of
two divergent DOM structures reachable only by re-parenting the score element across
breakpoints (which CSS alone cannot express safely). Desktop remains usable and
responsive, per the instruction to keep a working desktop variant while prioritizing
phone.

### Totals row

The last row of the table (`grid-area: total`, full width, below the score row) shows
the training total using the **existing, already-tested** `formatTrainingTotal()`
from `src/screens/trainingTotal.ts` — this task does not invent new total semantics.
Established convention (unchanged):

- whole-point sum = `Σ Math.floor(shot.score / 10)` over committed shots (per-shot
  floor, then summed — not the floor of the decimal sum);
- decimal sum = `(Σ shot.score / 10).toFixed(1)` over committed shots (ISSF decimal
  total, one decimal place);
- format: `"<whole> (<decimal>)"`, e.g. `29 (30.4)`;
- draft shots never count; empty/all-draft trainings render `'–'`.

No new formatter or component was added for the total — `TrainingScreen.tsx` calls
`formatTrainingTotal(shots)` directly, same as `TrainingsScreen` already does for the
trainings list.

### Acceptance criteria (this revision)

- On a phone-width viewport, the shot list no longer competes for vertical space
  with the target: it sits beside the score digit in one grid row, occupying fixed
  narrow columns (84px each side).
- Two visible columns of committed shots, permanently split by index parity, ordered
  ascending by `shotNumber` within each column.
- Still display-only: no `onClick`/selection semantics added to `ShotsList` rows.
- Still committed-only, still excludes drafts.
- A totals row is always visible below the score/list row, using the existing
  `formatTrainingTotal` semantics verified by `trainingTotal.test.ts` (unchanged).
- `npx vitest run` and `npm run build` stay green.

### Files touched (this revision)

- `src/components/ShotsList.tsx` (props/split logic changed: `side` instead of full
  list; single-column vertical layout)
- `src/components/ShotsList.module.css` (simplified to one vertical scrolling column,
  no more mobile-strip/desktop-sidebar media query branch)
- `src/components/shotsList.render.test.tsx` (updated for the `side` prop and parity
  split)
- `src/screens/TrainingScreen.tsx` (renders two `<ShotsList side=...>` around the
  score, plus a totals row using `formatTrainingTotal`)
- `src/screens/TrainingScreen.module.css` (three-column grid row for
  listL/score/listR, new `total` grid row, single-breakpoint desktop widening only)

No change to `src/screens/trainingTotal.ts` or its tests — reused as-is.

## Fix — bounded shot-list row (reviewer P1)

Reviewer found that the `listL/score/listR` grid row was sized `auto`, so on a long
training (many committed shots) the row grew with content, shrinking the
`minmax(0, 1fr)` target row and pushing the toolbar row toward/off the bottom of the
fixed-height (`100dvh`) `.page` grid.

Fix: `.page`'s `grid-template-rows` now gives that row a fixed height (`112px`)
instead of `auto`, at every viewport width (the media query only widens the side
columns, not the rows). The row can no longer grow with the number of shots; each
`ShotsList` column keeps its own internal `overflow-y: auto` (already in
`ShotsList.module.css`, unchanged) so a long history scrolls within its fixed-height
column instead of resizing the row. `.scoreDisplay` gained `display: flex;
align-items: center; justify-content: center` so the score digit stays vertically
centered in the now fixed-height cell instead of sitting at the top with empty space
below it.

No change to `ShotsList.tsx`/`ShotsList.module.css` internals, no new dependency.

## Update — desktop sidebar restored, phone columns tightened to 5 rows

Follow-up revision, driven by explicit feedback: the two-column phone-first layout
from the previous revision, when reused unchanged as the desktop layout too, gave up
the original full-history sidebar next to the target on wide screens. Phone width
also still only fit 4 rows per column, not the desired 5.

### `ShotsList` — new `side="all"` mode

`ShotsList`'s `side` prop grows a third value, `'all'`, alongside the existing
`'left'`/`'right'`: it renders every committed shot in ascending order, unfiltered by
index parity. `'left'`/`'right'` behavior (phone two-column parity split) is
unchanged. No new component was added — this is a mode of the existing one, since
the display rules (committed-only, ascending, display-only markup) are identical.

### Layout — phone keeps the two-column split, desktop gets its sidebar back

`TrainingScreen.module.css`'s `.page` grid now branches per breakpoint instead of
sharing one grid at every width:

- **Phone (default, unchanged from the previous revision):** `84px 1fr 84px`
  columns, `listL/score/listR` fixed-height row, full-width `total` row below it —
  same grid areas and elements as before.
- **Desktop (`@media (min-width: 900px)`):** columns become `1fr 280px`;
  `grid-template-areas` drops `listL`/`listR`/`total` in favor of a single `sidebar`
  area spanning the target/score/toolbar rows, matching the very first revision's
  desktop sidebar shape. The phone-only `.shotsListWrapLeft`, `.shotsListWrapRight`,
  `.totalsRow` elements are hidden (`display: none`) at this breakpoint; `.sidebarWrap`
  (hidden by default, `display: flex` at `>=900px`) takes over.

`TrainingScreen.tsx` renders both: the existing `listL`/`score`/`listR`/`total`
markup (used on phone) and a new `.sidebarWrap` containing `<ShotsList side="all">`
plus its own `.sidebarTotalsRow` — the sidebar's totals row is the last item inside
the sidebar itself (bordered on top), matching the request that the total appear as
the last row of the side table, not a separate full-width band. Both totals reuse
the same, unchanged `formatTrainingTotal()` — no new total semantics.

Only one of the two shot-history renderings is visible at a time per the media
query; both are always mounted (no JS viewport detection), consistent with this
plan's CSS-only breakpoint approach.

### Phone column density — 5 rows instead of 4

`ShotsList.module.css`'s base (phone, `<900px`) `.item`/`.list` rules were tightened
to remove the main per-row space cost, the visible border:

- `.item` border removed (`border: none`) on phone; font-size 12px → 11px; padding
  `3px 4px` → `2px 3px`.
- `.list` gap 4px → 2px on phone.

At `>=900px` (now exclusively the `side="all"` desktop sidebar), the existing larger
readable style is kept and the border is restored explicitly at that breakpoint
(`border: 1px solid var(--color-border)`, `gap: 4px`), so the sidebar's rows still
read as a bordered table on desktop — only the phone density changed.

### Testing

- `src/components/shotsList.render.test.tsx` gained a case for `side="all"`:
  committed shots render in order, drafts stay excluded, no parity filtering.
- `npx vitest run` (380 tests / 17 files) and `npm run build` stay green.

### Files touched (this revision)

- `src/components/ShotsList.tsx` (`side` prop type gains `'all'`, filter logic)
- `src/components/ShotsList.module.css` (phone density tightened; `>=900px` block
  keeps/restores the readable bordered style for the sidebar)
- `src/components/shotsList.render.test.tsx` (new `side="all"` test case)
- `src/screens/TrainingScreen.tsx` (renders `.sidebarWrap` with `<ShotsList
  side="all">` + its own totals row, alongside the unchanged phone markup)
- `src/screens/TrainingScreen.module.css` (desktop `@media` block now redefines
  `.page`'s columns/rows/areas for the sidebar shape and hides the phone-only
  elements; new `.sidebarWrap`/`.sidebarList`/`.sidebarTotalsRow` rules)

No change to `src/screens/trainingTotal.ts` or its tests — reused as-is, on both the
phone and desktop totals rows.

## Revision: sequential left/right fill + desktop sidebar visibility fix

Two bugs reported after the previous revision shipped.

### Phone column fill order

The parity split (even index → left, odd → right) filled the two columns
interleaved (left: №1, №3, №5…; right: №2, №4, №6…), which reads oddly compared to
a scorecard. `ShotsList`'s `'left'`/`'right'` split is now sequential: the left
column takes the first half of committed shots (`Math.ceil(length / 2)`, so the left
column gets the extra shot when the count is odd), the right column takes the rest —
e.g. 10 shots → left №1–5, right №6–10. Order within each column is unchanged
(ascending by `shotNumber`). This means a shot's column can now shift as later shots
are appended (the split point moves), unlike the old permanent parity assignment —
accepted trade-off per the explicit request for left-then-right fill order.

### Desktop sidebar was invisible

`.sidebarWrap`'s `display: flex` (inside `@media (min-width: 900px)`) was declared
*before* its own unconditional `display: none` base rule in the same file. CSS
resolves ties between rules of equal specificity by source order regardless of
whether a rule sits inside `@media` — so at ≥900px the later, always-on `display:
none` silently won and the sidebar never showed, even though the query matched and
the grid area/columns behind it were otherwise correct. Fix: the `@media
(min-width: 900px)` block for `.page`/`.shotsListWrapLeft`/`.shotsListWrapRight`/
`.totalsRow`/`.sidebarWrap` was moved to the end of `TrainingScreen.module.css`, after
all base rules it overrides, restoring the intended cascade.

### Testing

- `shotsList.render.test.tsx`: replaced the parity-split case with two cases —
  sequential fill across an even (10-shot) and odd (3-shot) count.
- No new CSS regression test was added (CSS modules aren't loaded by Vitest's
  render-to-string tests, so cascade order isn't exercised by the suite); verified
  the fix by reasoning about cascade order and confirming `.sidebarWrap`'s CSS rule
  is emitted after its base `display: none` rule in the built stylesheet.
- `npx vitest run` and `npm run build` stay green.

### Files touched (this revision)

- `src/components/ShotsList.tsx` (`'left'`/`'right'` split logic: sequential halves
  instead of index parity; updated doc comment)
- `src/components/shotsList.render.test.tsx` (updated split test cases)
- `src/screens/TrainingScreen.module.css` (moved the `@media (min-width: 900px)`
  block to the end of the file, after `.sidebarWrap`'s base rule)

## Bottom toolbar: fixed 3-slot layout (one-handed use)

The toolbar previously grew a 4th button (`+ Новая`) once `isCompleted`, and also
duplicated "+ Новая тренировка" as a separate button inside `.completedBanner`.
Both of these shifted button widths/positions between the active and completed
states — bad for one-handed use where the coach re-grabs the phone by feel after
each shot.

The toolbar is now a fixed 3-slot grid (`grid-template-columns: 1fr 1fr 1fr`),
same 3 slots in both states, only the left/right slot's action changes:

| Slot | Active training | Completed training |
| --- | --- | --- |
| Left | Отменить (undo last shot) | Замечания (open comment for target shot) |
| Center | Масштаб (zoom toggle) — always here, never moves | Масштаб (zoom toggle) |
| Right | Замечание (open comment for target shot) | + Новая тренировка (primary style) |

`.completedBanner` is now a status-only strip ("Тренировка завершена"); its
duplicate "+ Новая тренировка" button was removed since the same action now lives
in the toolbar's right slot. The completed-limit `Modal` (shown once, right after
the training auto-completes) still offers its own `Просмотр` / `+ Новая
тренировка` actions unchanged — "Просмотр" just closes the modal onto this same
screen, which remains fully viewable (target, shot history, sidebar totals) with
the completed toolbar.

CSS: replaced `.undoBtn` / `.commentBtn` / `.newTrainingBtn` / `.zoomToggle` (the
last one had become unused) with a single `.slotBtn` (equal `width: 100%` in each
1fr grid column, `text-overflow: ellipsis` guard for narrow phones) plus
`.slotBtnPrimary` for the completed-state "+ Новая тренировка" accent.

### Files touched (toolbar revision)

- `src/screens/TrainingScreen.tsx` (toolbar JSX: 3 fixed slots swapping by
  `isCompleted`; `.completedBanner` reduced to status text only)
- `src/screens/TrainingScreen.module.css` (`.slotBtn`/`.slotBtnPrimary` replacing
  `.undoBtn`/`.commentBtn`/`.newTrainingBtn`/`.zoomToggle`; `.toolbar` switched to a
  3-column grid; `.newTrainingBannerBtn` removed)

No new automated test was added for this revision: `TrainingScreen.tsx` has no
existing test file in this repo (verified via `find`/`grep` before starting), and
adding one is out of scope for this narrow toolbar layout change. Verified
manually by reading the rendered JSX/CSS for both `isCompleted` branches.
`npx vitest run` (381 passed) and `npm run build` stay green.

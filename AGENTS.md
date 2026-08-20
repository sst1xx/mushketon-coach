# AGENTS.md — read this first

`mushketon-coach` — offline PWA for a shooting coach (ISSF 10 m air pistol).
The coach reads a shot position from the electronic target monitor and enters it manually:
tap on the target → drag to refine → live ISSF decimal score → release commits.
All data stays on the device (IndexedDB). No backend, no accounts, no sync.

## 1. Hard rules (never break)

1. NEVER commit unless the user explicitly says "commit" / "закоммить". Ask before committing.
2. NEVER deploy unless the user explicitly asks.
3. NEVER install/upgrade packages without explicit user approval.
4. NEVER add: backend API, user accounts, cloud DB (D1/KV), analytics, CDN/fonts from other
   origins, `unsafe-inline`/`unsafe-eval` in CSP, new runtime dependencies.
5. Change only what the task requires. Do not refactor or reformat adjacent code.
6. Keep scoring/geometry pure: `src/scoring.ts`, `src/transform.ts` must contain no React and no I/O.
7. Before any large change (multiple files/layers), write a plan in `plans/PLAN-<feature>.md` and
   get approval — unless the user says "skip planning" / "just do it".

## 2. Commands

```bash
npm install
npm run dev        # Vite dev server
npx vitest run     # tests — must stay green (285 passing)
npm run build      # tsc + vite build → dist/
npm run preview
```

`npm test` also works. After code changes always run `npx vitest run`; run `npm run build` too if
types could break.

## 3. Where things are

```
src/scoring.ts        ISSF decimal score (pure)          + scoring.test.ts
src/transform.ts      screen ↔ target coordinates (pure) + transform.test.ts
src/db/               IndexedDB: schema, open, tx+epoch, settings, startup cleanup
src/domain/           athleteRepo, trainingRepo, shotRepo, backupService
src/components/       TargetCanvas (SVG target + shots), UpdateBanner
src/screens/          AthletesScreen, TrainingsScreen, TrainingScreen, SettingsScreen
src/App.tsx           screen routing        src/main.tsx bootstrap      src/sw.ts service worker
public/_headers       CSP + security headers
vite.config.ts        Vite + vite-plugin-pwa (injectManifest, prompt update)
wrangler.toml         Cloudflare Pages (static hosting only, output dir dist)
plans/PLAN.md         full spec, source of truth (RU)
plans/PLAN-*.md       per-feature plans; use PLAN-TARGET-ZOOM.md as template
CHANGES-TARGET-VISUAL.md  exact ISSF target geometry and colors
```

Stack: TypeScript, React 18, Vite 5, vite-plugin-pwa, raw IndexedDB, Vitest + fake-indexeddb.

## 4. Data conventions

- Coordinates: integer hundredths of mm (`xh`, `yh`).
- Score: integer tenths (109..10, or 0 for miss); displayed as ISSF decimal 10.0–10.9.
- Shot status: `draft` | `committed`.
- `TrainingRecord.nextShotNumber` is monotonic — shot numbers are event ordinals, NEVER renumbered.
- `dataEpoch` guards writes from stale clients after a restore.
- Backup = one JSON file (`version: 1`) with all data; see `BackupFile` in
  `src/domain/backupService.ts`. Restore is validated and atomic. Backup strings render as text only.

## 5. Product decisions (locked)

- Phone-first, portrait-first PWA; tablet secondary; offline-first.
- Coach must select/create an athlete before anything else; several athletes at once with fast
  switching that must not reset the current training.
- Training = sequence of N shots, no fixed series size; can be reopened and continued.
- All hits are drawn on target, older ones less prominent.
- Last shot and older shots are editable repeatedly; undo exists for the last created shot.
- Deletion requires confirmation.
- "Анализ — в разработке" stays a stub.

Not in MVP: analysis, charts, group stats, comments, sighting/match series, sync, accounts,
cloud DB, electronic-target integration, camera recognition, competitions, per-training export.

## 6. Status

Done: scoring, transform, IndexedDB layer, domain repos, all four screens, backup/restore, PWA,
CSP, Cloudflare Pages config. Tests green (285).
Partial: ISSF target visuals — verify against `CHANGES-TARGET-VISUAL.md` before touching.
Missing: athlete switcher inside the training screen (`plans/PLAN.md` §6); analysis module.

## 7. Delegating to subagents

Agents (see `.pi/settings.json`), cheapest first: `scout` < `worker` < `reviewer` < `oracle`.

| Task | Agent |
| --- | --- |
| Find files, "where is X", read-only recon | `scout` |
| Write code, edit files, run tests/build, deploy | `worker` (only agent that edits) |
| Check worker's result vs task/plan, run tests | `reviewer` (may apply small fixes) |
| Risky design decision, or worker failed twice | `oracle` (advisory, never edits) |

Default pipeline: `scout` → plan → `worker` → `reviewer`.

Rules:
- The coordinator does not edit code or deploy — always delegate to `worker`.
- Use `context: fresh` for every implementation handoff.
- One `worker` writing in the working directory at a time.
- Every handoff = one focused task + plan reference + acceptance criteria + verification command
  (usually `npx vitest run`).
- Review after every `worker` code change, unless the user says "skip review" or the change is
  trivial (docs/comments/formatting).
- Never use `oracle` for recon or routine review; never use `worker` for read-only questions.
- Rework found by `reviewer` goes back to `worker`.

## 8. Output style

- Report only changed blocks (diff with 3–5 lines context), not whole files.
- For test/build output report the summary line, or the filtered errors if it failed.
- If the request is ambiguous, ask instead of guessing.

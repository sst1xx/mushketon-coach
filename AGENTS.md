# AGENTS.md — orientation for LLMs

Short context file. Read this first, then `PLAN.md` for details.

## 1. What this is

`mushketon-coach` — PWA for a shooting coach (ISSF 10 m air pistol).
During training the coach stands behind the athlete, reads the shot position from the
electronic target monitor and transfers it manually into the app. The app stores shots,
computes ISSF decimal score and keeps training history.

Problem solved: there is no simple, offline, local-only tool for a coach to log and score
shots of several athletes on a phone.

## 2. Users and usage

- Single user per device: the coach.
- Primary device: **phone**, tablet is secondary.
- Primary phone mode: **portrait** (manifest `orientation: portrait`).
- Used at the shooting range, possibly without internet → offline-first.

## 3. Key user scenario

1. Coach opens the app and **must first pick or create an athlete** (no work without an athlete).
2. Creates a new training or opens/continues an existing one.
3. Training = sequence of N shots, **no fixed series size**.
4. New shot: **tap** on the target → position refined by **drag** → score updates **in real time
   during drag** → release commits.
5. The last shot stays editable and can be corrected multiple times; **any older shot can also be
   edited**.
6. All hits are drawn on the target; older ones are rendered less prominently.
7. Undo is available for the last created shot.
8. Data lives only on the device; the coach makes a **backup file** to avoid data loss.

## 4. Architecture principles

```
Cloudflare Pages (static hosting only)
        │
       PWA
   ┌────┼──────────────┐
UI layer  Domain layer  Persistence (IndexedDB)
              │
        Target model + ISSF scoring (pure, UI-free)
```

- **Local-first**: all user data in IndexedDB on the device. Nothing is sent to a server.
- **Offline-first**: service worker precaches the app shell; update via prompt banner.
- **Scoring and target geometry are strictly separated from UI** (`src/scoring.ts`,
  `src/transform.ts` are pure functions, no React).
- Strict CSP (`public/_headers`): no `unsafe-inline`/`unsafe-eval`, no third-party runtime
  resources, no CDN/analytics/fonts from other origins.
- Dependencies pinned, lockfile committed, runtime deps minimal (react, react-dom only).

## 5. Locked decisions (do not change casually)

- App is a **PWA**; phone-first, portrait-first; tablet supported additionally.
- Athlete and training data are stored **only locally**; the server stores no user data.
- **Cloudflare is used for hosting only** (Pages, static assets). No D1, no KV, no backend API,
  no accounts.
- **IndexedDB** is the local storage engine.
- **Full backup/restore is mandatory**; a backup is **one file containing all app data**
  (athletes, trainings, shots, settings) — see `BackupFile` in `src/domain/backupService.ts`.
- Coach must select/create an athlete before anything else.
- One coach can run **several athletes at the same time**, with **fast switching** between them;
  switching must not finish or reset the current training.
- Training = sequence of N shots without fixed series length; an existing training can be
  reopened and continued.
- **Shot number is an event ordinal and is never automatically renumbered**
  (`TrainingRecord.nextShotNumber` monotonic).
- All hits are shown on the target, older ones less visible.
- Shot creation = tap; refinement = drag; score changes live during drag.
- Last shot remains editable, repeatedly; older shots are editable too.
- **ISSF decimal scoring 10.0–10.9** (internally integer tenths, coordinates in integer
  hundredths of mm).
- **Full analysis is not implemented yet**; UI keeps an "Анализ — в разработке" entry.
- Deletion is allowed **with confirmation**.
- Do not add cloud database, accounts or backend without a separate explicit decision.

## 6. MVP scope (PLAN.md §26)

Athlete list/creation, fast athlete switching, training create/open/continue, N-shot sequence,
interactive target, tap-to-create, drag positioning, live score, re-editing of last and older
shots, rendering of all previous hits, ISSF decimal scoring, training history, delete with
confirmation, local storage, offline, full backup, restore, PWA, free Cloudflare Pages
deployment, "Анализ — в разработке" stub, undo of last created shot, persistent-storage request
and backup reminder.

## 7. Explicitly NOT in MVP (PLAN.md §27)

Training analysis, progress charts, group analysis, coach comments, sighting/match series,
cross-device sync, accounts, cloud DB, electronic target integration, camera recognition,
automatic result import, competitions, export of a single training.

## 8. Repository layout

```
PLAN.md                       full spec (source of truth, RU, ~1500 lines)
CHANGES-TARGET-VISUAL.md      spec for correct ISSF target rendering
CLOUDFLARE-FREE-CONSTRAINTS.md  free-tier limit analysis (conclusion: no blockers)
index.html                    app entry
vite.config.ts                Vite + vite-plugin-pwa (injectManifest, prompt update)
vitest.config.ts              tests (fake-indexeddb)
wrangler.toml                 Cloudflare Pages project (pages_build_output_dir = dist)
public/_headers               CSP and security headers
src/main.tsx, src/App.tsx     bootstrap, screen routing (athletes/trainings/training/settings)
src/sw.ts                     service worker source
src/scoring.ts(.test)         ISSF decimal scoring, pure
src/transform.ts(.test)       screen ↔ target coordinate mapping, pure
src/db/                       IndexedDB: schema, open, tx (epoch), settings, startup cleanup
src/domain/                   athleteRepo, trainingRepo, shotRepo, backupService
src/components/               TargetCanvas (SVG target + shots), UpdateBanner
src/screens/                  AthletesScreen, TrainingsScreen, TrainingScreen, SettingsScreen
.agents/skills/               vendored Cloudflare/wrangler reference skills (not app code)
```

## 9. Stack and constraints

TypeScript, React 18, Vite 5, vite-plugin-pwa + workbox-window, IndexedDB (raw, no wrapper),
Vitest + fake-indexeddb, Cloudflare Pages hosting.
Not allowed: backend API, Kubernetes/VPS, PostgreSQL, Cloudflare D1/KV, user accounts.

Data conventions: coordinates stored as integer hundredths of mm (`xh`/`yh`), score as integer
tenths (109..10, 0). Shot has status `draft` | `committed`. A `dataEpoch` value guards writes
against stale clients after restore.

## 10. Data and personal data rules

- Only athlete name + training/shot data; no auth, no telemetry, no network transfer.
- Everything stays in IndexedDB; app requests persistent storage and reminds about backups.
- Backup/restore is the only data movement path, user-initiated, one JSON file
  (`version: 1`), restore is validated and atomic; strings from backups are rendered as text only.
- Filenames for backups are generated and sanitized by the app.

## 11. Build, test, run

```bash
npm install
npm run dev        # Vite dev server
npm test           # vitest run (254 tests: scoring, transform, db, domain)
npm run build      # tsc -p tsconfig.app.json && vite build → dist/
npm run preview    # preview production build
```
Deployment: Cloudflare Pages, output dir `dist`.

## 12. Documents to read for depth

1. `PLAN.md` — full functional and technical spec (domain model, gesture model, scoring §14,
   backup §16–17, storage §19, MVP §26–27, implementation order §28).
2. `CHANGES-TARGET-VISUAL.md` — exact ISSF target geometry and colors.
3. `CLOUDFLARE-FREE-CONSTRAINTS.md` — hosting limits.

## Current Status

**Implemented**
- ISSF decimal scoring module and coordinate transform (pure, tested: 216 + 15 tests).
- IndexedDB layer: schema, versioned open, transaction/epoch guards, settings, startup cleanup.
- Domain layer: athlete/training/shot repositories, undo of last committed shot,
  full export/validate/import backup service.
- UI: athletes screen (create, select, delete with confirmation, persistent-storage request),
  trainings screen (create, open, delete with confirmation), training screen (target, tap/drag
  input, live score, editing of last and older shots, undo), settings screen with
  backup/restore and "Анализ — в разработке" stub.
- PWA: manifest, service worker, update banner; CSP headers; Cloudflare Pages config.
- Test suite green: 254 tests.

**In progress / partial**
- ISSF target visual per `CHANGES-TARGET-VISUAL.md` (rings and marker contrast fixed in recent
  commits; verify against the spec before further changes).

**Not implemented**
- Fast athlete switcher inside the training screen (PLAN §6 dropdown); switching currently
  requires navigating back to the athletes list.
- Training analysis and everything listed in §7 above.

**OPEN QUESTION**
- Whether the "Анализ" stub will later grow into a full analysis module inside this app or a
  separate tool — not decided in the repository.

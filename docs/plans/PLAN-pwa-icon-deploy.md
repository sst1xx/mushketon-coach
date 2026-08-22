# PLAN — PWA icon fix + deployment verification

## Problem

- `public/icon-192.png` and `public/icon-512.png` were both 1×1 placeholder PNGs despite the
  manifest declaring 192×192 / 512×512 — installability/icon rendering was broken.
- `index.html` used a root-absolute favicon path (`/icon-192.png`), which breaks under the
  GitHub Pages subpath build (`/mushketon-coach/`).
- Cloudflare Pages project (`musketoon-coach`) exists and Wrangler is authenticated, but there
  was no verification that a direct `dist` deploy works.

## Change

1. Generate real-sized 192×192 and 512×512 PNG icons (`scripts/gen-icons.py`, stdlib-only:
   `zlib`/`struct`, no new dependency) — a simple ISSF-style target/crosshair badge — and write
   them to `public/icon-192.png` / `public/icon-512.png`.
2. Fix `index.html` favicon link to use `%BASE_URL%icon-192.png` (Vite base-path substitution)
   instead of a root-absolute path, so it resolves correctly for both `/` (Cloudflare) and
   `/mushketon-coach/` (GitHub Pages) builds.
3. No changes to `vite.config.ts`, `wrangler.toml`, or the GitHub Actions workflow — both were
   already correctly configured; only verified them by building in both modes and deploying to
   Cloudflare Pages directly with `wrangler pages deploy dist`.

## Verification

- `npx vitest run` — 343 tests passed.
- `npm run build` (default, Cloudflare/root base) — manifest icons/favicon resolve to `/…`.
- `GITHUB_PAGES=true npx vite build` — manifest icons/favicon resolve to `/mushketon-coach/…`.
- `npx wrangler pages deploy dist --project-name=musketoon-coach` — succeeded; confirmed live
  icon at `https://<deploy>.musketoon-coach.pages.dev/icon-192.png` is a real 192×192 PNG.
- GitHub Pages deploy itself is CI-triggered on push to `main`; not run here since committing/
  pushing to `main` is outside this task's scope (see AGENTS.md — no commits without explicit
  request).

## Out of scope

- No new npm dependencies (icons generated with the Python standard library only).
- No changes to CSP/`_headers`, service worker, or manifest fields beyond fixing icon files.

# Project Utopia — V1

A reels-style, web-first arcade of 20 short, beautiful games, each designed around a cognitive ability
(memory, attention, perception, reasoning, language, flexibility, timing, calm). Scroll live previews, tap **Play**,
tap **Exit**, and land back on the exact card you left.

Product spec: [`PRD.md`](./PRD.md) · Game authoring guide: [`docs/GAME_AUTHORING.md`](./docs/GAME_AUTHORING.md)

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (also on your LAN IP for phone testing)
```

Production build + local preview (installable PWA, offline shell):

```bash
npm run build
npm run preview      # http://localhost:4173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run typecheck` | Strict TypeScript check |
| `npm test` | Unit tests (Vitest) |
| `node scripts/smoke.mjs <gameId\|all>` | Headless Chromium smoke test of a game (preview + play with random input); screenshots in `shots/` |
| `node scripts/capture-posters.mjs [ids]` | Re-capture feed/library poster frames from each game's live preview into `public/posters/` |
| `node scripts/app-smoke.mjs [--desktop]` | End-to-end platform flow: feed → play → pause → exit returns to same card → pages |

Both smoke scripts need the dev server running and Playwright's Chromium (`npx playwright install chromium`).

## Routes

| Route | Screen |
|---|---|
| `/` | Reels feed (`?card=<id>` jumps to a card) |
| `/play/<id>` | Full-screen play overlay (`?daily=1` for the Daily Seed) |
| `/game/<id>` | Game detail page with live preview, science note, accessibility profile |
| `/library` | All games, filterable by ability / energy / accessibility |
| `/progress` | Ability rings (practice minutes), personal bests, recent sessions |
| `/settings` | Global accessibility, audio, gameplay, wellbeing and data settings |
| `/about` | Claims policy, ability glossary, credits |
| `/lab` | Developer Game Lab: mount any game in isolation (`?game=<id>&mode=play\|preview`) |

## Architecture (short version)

```
src/
  sdk/        Public API for game authors: types, seeded RNG, staircase, tween, utils,
              R3F helpers (@/sdk/r3f) and Pixi helpers (@/sdk/pixi)
  runtime/    Game host (lifecycle, pause-aware clock/timers, context factory),
              Web Audio engine (buses, synth voices, TTS), quality tiers
  platform/   Zustand stores: settings, progress, feed ordering, posters, analytics
  app/        React UI: feed, play overlay (how-to, HUD, pause, results), pages
  games/      20 self-contained games, auto-registered from games/*/index.ts
```

- **One live WebGL context in the feed**: only the centered card mounts its game in preview (attract) mode, driven
  by a ghost player. Other cards show a poster captured from their last live preview (cached in IndexedDB).
- **Games plug into one SDK**: each game gets a `GameContext` (pause-aware loop/timers, seeded RNG, audio, HUD,
  staircase difficulty, settings, storage) and returns `{ start, destroy }`. Pausing freezes game time, rendering
  and audio in every game uniformly.
- **Local-first**: progress, history and settings live on the device (localStorage/IndexedDB). No accounts or
  network calls are required; analytics are on-device only and off by default.
- **Everything is procedural**: geometry, textures, shaders and sound are generated at runtime (no third-party art
  assets to license). Fonts are OFL (Fraunces, Manrope, Atkinson Hyperlegible via Fontsource).

## V1 deviations from the PRD (deliberate, for a runnable first build)

- Single Vite package with folder boundaries instead of a pnpm/Turborepo monorepo.
- Optional cloud sync (Supabase) and remote analytics (PostHog) are not wired up; the app is fully local-first,
  with export/delete data in Settings.
- Rhyme Tide uses the browser's speech synthesis instead of recorded voice talent.
- Feed previews use still posters (captured by `scripts/capture-posters.mjs`, then refreshed from live previews at runtime) instead of a CI video-loop pipeline; the centered card always runs the real game live.

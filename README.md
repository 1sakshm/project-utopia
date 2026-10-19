# Project Utopia

A reels-style, web-first arcade of short games (30 and growing, 10 of them voice games in English and Hindi), each
designed around a cognitive ability (memory, attention, perception, reasoning, language, flexibility, timing, calm).
Scroll live previews, tap **Play**, or take on someone live in **Versus**: same game, same layout, same moment,
highest score wins.

Product spec: [`PRD.md`](./PRD.md) · Game authoring guide: [`docs/GAME_AUTHORING.md`](./docs/GAME_AUTHORING.md)

## Run it

```bash
npm install
npm run dev          # http://localhost:5173  (also on your LAN IP for phone testing)

# Multiplayer (optional, second terminal)
npm --prefix server install
npm run versus:dev   # match server on ws://localhost:8787, picked up automatically by the dev build
```

Copy `.env.example` to `.env.local` for production settings (match server URL, AdSense, analytics, voice).

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
| `node scripts/touch-scroll.mjs` | Mobile touch-swipe test for the feed (real touch events on live previews) |
| `node scripts/analytics-check.mjs` | Verifies analytics (on/off/migration/outage) against a build with a dummy key (see header) |
| `node scripts/voice-e2e.mjs` | Voice flow in the real app: consent sheet, typing path, mic fallback without a key |
| `node scripts/app-smoke.mjs [--desktop]` | End-to-end platform flow: feed → play → pause → exit returns to same card → pages |

Both smoke scripts need the dev server running and Playwright's Chromium (`npx playwright install chromium`).

## Hosting

Two live copies of the same app:

- **Cloudflare Pages:** https://playutopia.pages.dev. Deploy with `npm run deploy:cf` (builds, then uploads `dist/`;
  the voice API runs from `functions/api/*`, which wrap the same `api/_sarvam.ts` handlers). The Sarvam key is a
  Pages secret: `npx wrangler pages secret put SARVAM_API_KEY --project-name playutopia`.
- **Vercel (backup):** https://project-utopia-zeta.vercel.app. Auto-deploys on every push to `main` (`api/*` edge functions).

`VITE_*` variables are baked in at build time, so a Cloudflare deploy uses the values in your local `.env.local`.

## Environment variables (Vercel)

| Variable | Purpose |
|---|---|
| `VITE_POSTHOG_KEY` | PostHog project API key (`phc_...`). When unset, nothing is sent. |
| `VITE_POSTHOG_HOST` | Optional. `https://us.i.posthog.com` (default) or `https://eu.i.posthog.com`. |
| `VITE_FEEDBACK_URL` | Optional. A feedback form link (Tally / Google Forms). Shows "Share feedback" buttons when set. |
| `VITE_VERSUS_URL` | Match server address (`wss://…workers.dev`). Unset in production = Versus is hidden. See [`server/README.md`](./server/README.md). |
| `VITE_ADSENSE_CLIENT` | AdSense publisher id (`ca-pub-…`). Without it no ad code loads. |
| `VITE_ADSENSE_SLOT_HOME` / `_GAMES` / `_VERSUS` | Display ad unit ids for the bottom of Home, Games and Versus. Ads never appear inside a game. |
| `VITE_ADS_PROVIDER` | Rewarded ads: `h5` (Google H5 Games Ads), `mock`, or `off` (default in production). |
| `SARVAM_API_KEY` | Sarvam AI key for the voice games (server-side only, **no** `VITE_` prefix). Used by `/api/tts` and `/api/stt`. For local dev put it in `.env.local`. Without it, voice games fall back to device speech + typing. |

Analytics are anonymous (random ID in localStorage, no cookies, no names/emails, no per-trial data), on by
default with an off switch in Settings, and honor Do Not Track. Nothing is sent from local dev unless
`VITE_POSTHOG_DEV=1`.

## Routes

| Route | Screen |
|---|---|
| `/` | Home: Today's 3, Versus, continue, new games |
| `/feed` | Reels feed (`?card=<id>` jumps to a card) |
| `/play/<id>` | Full-screen play overlay (`?daily=1` for the Daily Seed) |
| `/versus` | Multiplayer dashboard: quick match, friend duel, party, join by code, live matches, leaderboard |
| `/versus/m/<CODE>` | A match room (`GHOST` = local ghost race) |
| `/versus/watch/<CODE>` | Spectate a live match |
| `/library` | All games, filterable by ability and accessibility |
| `/you` | Profile, rating, quests, weekly minutes by ability, personal bests (`/progress` still works) |
| `/game/<id>` | Game detail page with live preview, science note, accessibility profile, Challenge |
| `/settings` | Global accessibility, theme, audio, gameplay, wellbeing and data settings |
| `/shop` | Accent colors, avatars, boost packs (orbs only) |
| `/welcome` | Public landing page |
| `/about`, `/privacy` | Claims policy, ability glossary, credits; privacy & terms |
| `/lab` | Developer Game Lab: mount any game in isolation (`?game=<id>&mode=play\|preview`) |

## Architecture (short version)

```
src/
  sdk/        Public API for game authors: types, seeded RNG, staircase, tween, utils,
              R3F helpers (@/sdk/r3f) and Pixi helpers (@/sdk/pixi)
  runtime/    Game host (lifecycle, pause-aware clock/timers, context factory),
              Web Audio engine (buses, synth voices, TTS), quality tiers
  platform/   Zustand stores: settings, progress, feed ordering, posters, analytics
  platform/versus/  Multiplayer client: wire protocol, lobby + match stores, ghost races
  app/        React UI: feed, play overlay (how-to, HUD, pause, results, versus mode), pages
  styles/     ui.css (tokens + components, light/dark/high-contrast) and pages.css
  games/      30 self-contained games, auto-registered from games/*/index.ts
server/       Match server: Cloudflare Worker + Durable Objects (Lobby, Match)
```

- **One live WebGL context in the feed**: only the centered card mounts its game in preview (attract) mode, driven
  by a ghost player. Other cards show a poster captured from their last live preview (cached in IndexedDB).
- **Games plug into one SDK**: each game gets a `GameContext` (pause-aware loop/timers, seeded RNG, audio, HUD,
  staircase difficulty, settings, storage) and returns `{ start, destroy }`. Pausing freezes game time, rendering
  and audio in every game uniformly.
- **Local-first**: progress, history and settings live on the device (localStorage/IndexedDB). No accounts or
  network calls are required; analytics are on-device only and off by default.
- **Everything is procedural**: geometry, textures, shaders and sound are generated at runtime (no third-party art
  assets to license). Fonts are OFL (Geist and Atkinson Hyperlegible via Fontsource).

## V1 deviations from the PRD (deliberate, for a runnable first build)

- Single Vite package with folder boundaries instead of a pnpm/Turborepo monorepo.
- Optional cloud sync (Supabase) and remote analytics (PostHog) are not wired up; the app is fully local-first,
  with export/delete data in Settings.
- Rhyme Tide uses the browser's speech synthesis instead of recorded voice talent.
- Feed previews use still posters (captured by `scripts/capture-posters.mjs`, then refreshed from live previews at runtime) instead of a CI video-loop pipeline; the centered card always runs the real game live.

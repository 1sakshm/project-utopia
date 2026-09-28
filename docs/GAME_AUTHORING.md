# Utopia Game Authoring Guide

Every Utopia game is a self-contained folder under `src/games/<id>/` that plugs into the shared runtime.
Read this whole file, then study the two reference games before writing code:

- **R3F reference:** `src/games/echo-garden/` (`index.ts`, `logic.ts`, `game.tsx`)
- **Pixi reference:** `src/games/firefly-night/` (`index.ts`, `game.ts`)

Game design specs (concept, loop, controls, difficulty, scoring, art, sound, accessibility, preview) are in
`PRD.md` §23 — find the section `### Game N — <Name>`. Implement that design as faithfully as practical.

## 1. Folder layout

```
src/games/<id>/
  index.ts      # default export defineGame({ manifest, load: () => import('./game') })  — must stay tiny
  game.ts(x)    # default export: (ctx: GameContext) => GameInstance | Promise<GameInstance>
  logic.ts      # optional: pure rules / generators (no engine imports)
  *.ts          # any other private modules (content, shaders, …)
```

The registry auto-discovers `src/games/*/index.ts` — you do **not** edit any shared file.

## 2. Hard rules

1. **Only edit files inside your own `src/games/<id>/` folders.** Never modify `src/sdk`, `src/runtime`, `src/platform`,
   `src/app`, other games, configs, or `package.json`. If you believe the SDK needs a change, work around it locally
   and mention it in your final report.
2. Imports allowed: `@/sdk` (types + helpers), `@/sdk/r3f`, `@/sdk/pixi`, `three`, `@react-three/fiber`,
   `@react-three/drei` (see rule 3), `@react-three/postprocessing`, `pixi.js`, `react`. Nothing else, no new npm packages.
3. **No network assets.** Everything is procedural: geometry, textures (canvas-generated), shaders, sound (Web Audio
   via `ctx.audio`). Do NOT use drei `<Text>`/`<Text3D>`/`<Environment preset>`/`useGLTF`/`useTexture` with URLs
   (they fetch from CDNs). For text in 3D use a canvas texture on a sprite/plane; for Pixi use `new Text({ text, style })`
   with `fontFamily: 'Manrope, system-ui, sans-serif'` (already loaded by the app).
4. `index.ts` must not import engine code (it is loaded eagerly for the feed). Only `defineGame` from `@/sdk`.
5. TypeScript strict must pass: `npx tsc --noEmit` (see §8 for filtering to your files).
6. Never call `ctx.end()` in preview mode (the runtime ignores it anyway) and never block on user input in preview.

## 3. The manifest (`index.ts`)

Copy the shape from a reference game. Fill every field honestly from the PRD. Notes:
- `id` = folder name (kebab-case). `hook` ≤ 60 chars. `howTo` = 2–4 very short steps (≤ 8 words each).
- `palette` = 5 hex colors; `bg` is used as the loading/overlay background, so make it dark.
- `results` = 1–3 stat defs; the keys must match `stats` you pass to `ctx.end()`.
- `science.note` must follow the claims policy: "Designed around…", never "improves/treats/boosts".
- Set `showScore: false` only for non-competitive games (Still Water).

## 4. The GameContext (what you get)

See `src/sdk/types.ts` for the full, commented interface. Most-used members:

| Member | Use |
|---|---|
| `ctx.mode` | `'play'` or `'preview'` (feed attract mode: run a **ghost player** forever, no end) |
| `ctx.container` | Your DOM root (position: relative, fills the screen). Renderers append their canvas here. |
| `ctx.layout()` / `ctx.onResize(cb)` | `{ width, height, safe:{x,y,w,h} }`. Keep all gameplay-critical content inside `safe` (centered 9:16). Decorative content should fill the full width/height. |
| `ctx.loop(cb, priority?)` | Pause-aware per-frame callback `(dtMs, timeMs)`. Stops while paused. |
| `ctx.after(ms, cb)` / `ctx.wait(ms)` | Pause-aware timeout / sleep. **Never use setTimeout/setInterval for gameplay.** |
| `ctx.time()` | Pause-aware game clock in ms. Use it for reaction times and windows. |
| `ctx.keys({ Space: fn, ArrowLeft: fn, Digit1: fn })` | Keyboard by `KeyboardEvent.code`; auto-ignored while paused / in preview. |
| `ctx.rng` | Seeded RNG (`next`, `int`, `pick`, `shuffle`, `chance`). Use it instead of Math.random for gameplay so Daily Seed works. |
| `ctx.staircase({min,max,up,down})` | Adaptive difficulty over an integer level, starting from `ctx.startLevel`. |
| `ctx.hud.set({ score, level, lives, maxLives, timer, progress, label })` | Platform-rendered HUD (top of screen). Don't draw your own score UI. |
| `ctx.audio.*` | `pluck/bell/chime/tone/thunk/noise/tick/success/error`, `scale(rootMidi, mode)`, `ambient(chordMidi[])` (returns stop fn), `speak(text)` (TTS), `now()`, `latency()`, `raw` (AudioContext for precise scheduling), `sfxOut`. |
| `ctx.settings` | Live object: `reducedMotion, highContrast, timingMultiplier, noTimePressure, flashIntensity, captions, showKeyHints, readingFont, textScale, leftHanded`. Read it when needed; implement `onSettings` to react. |
| `ctx.quality` | `{ tier, maxDpr, postFx, particleScale }` — scale particle counts/effects by it. |
| `ctx.haptics.tick/success/error()`, `ctx.caption(text)`, `ctx.announce(text)` | Feedback & accessibility. Caption every meaningful sound; announce state changes. |
| `ctx.trial({correct, rtMs?, level?})` | Record each trial (local stats). |
| `ctx.storage.get/set` | Per-game persisted KV (e.g. calibration, unlocked items). |
| `ctx.revive()` | Second chance. If your game ends because lives/shields/misses ran out (before its natural end), `await ctx.revive()` first: the platform pauses and may offer an optional ad or a Second Wind boost. If it resolves `true`, restore **one** life and carry on; recheck `alive` after the await. Offered at most once per session; always `false` in preview. |
| `ctx.end({ score, levelReached, stats, message? })` | Finish the session → platform results screen. |

`GameInstance`: `{ start(), destroy(), onPause?(), onResume?(), onSettings?(s) }`.
- The platform shows the how-to card, then calls `start()`. In preview mode `start()` is called immediately.
- `destroy()` must free everything (R3F: call the unmount fn from `mountR3F`; Pixi: the app is auto-destroyed on
  `ctx.signal` abort, but stop your ambient audio and remove any DOM you added). Set an `alive=false` flag so pending
  async loops exit.
- Audio: the runtime suspends the AudioContext while paused, so scheduled audio pauses too.

## 5. Engine helpers

**R3F (`@/sdk/r3f`)**
- `mountR3F(ctx, <Scene/>, { camera, orthographic?, shadows?, background })` → returns `unmount()`.
  The canvas uses `frameloop="never"` and is advanced by `ctx.loop`, so **`useFrame` delta is pause-aware**.
  Accumulate your own time from `dt` or use `state.clock.elapsedTime` (also pause-aware).
- `useGame()` gives the ctx inside components.
- `<GameEffects bloom threshold />` — bloom/vignette, auto-disabled on low tier. **Your game must still look good
  without it** (headless tests and low-end phones run without postFx). Use additive glow sprites (`softDotTexture()`)
  behind emissive objects as a "fake bloom" that works on every tier (see Echo Garden's flower halos).
- `<ParticleBurst ref max size />` → `ref.current.burst([x,y,z], count, {color, speed, life, gravity})`.
- `<Motes count area color size />` ambient drifting particles, `<GradientSky top bottom />` backdrop sphere.
- Pointer input: R3F `onPointerDown` on meshes (give tap targets an invisible larger hit mesh ≥ 48px on a phone).
- Share state between game logic and React via a small mutable view-model + `useSyncExternalStore`
  (see `View` in Echo Garden). Avoid React re-renders every frame; mutate refs in `useFrame`.
- Fit the camera to the aspect ratio so the gameplay area fits in a portrait phone (see `CameraRig` in Echo Garden).

**Pixi v8 (`@/sdk/pixi`)** — note this is Pixi **v8** API (`app.init`, `Graphics().circle().fill()`,
`new Text({text, style})`, `sprite.eventMode = 'static'`, `container.destroy({children:true})`).
- `await createPixiApp(ctx, { background })` → `Application`, sized to the container, rendered by `ctx.loop` at
  priority -100 (after your logic). Auto-destroyed on abort.
- `glowTexture(size, falloff)` (tint it; `blendMode = 'add'`), `gradientTexture(stops)`,
  `createParticles(ctx, parent, max)` → `.burst(x, y, n, {color, speed, life, gravity, size})`.
- Input: either per-object `eventMode='static'` + `on('pointerdown')`, or stage-level with nearest-object search
  (see Firefly Night; set `app.stage.eventMode='static'; app.stage.hitArea = app.screen`).
- Redraw layout-dependent graphics in `ctx.onResize`.

**Engine-agnostic (`@/sdk`)**: `tween(ctx, ms, t => …, ease)` (pause-aware, returns a promise), `clamp`, `lerp`,
`damp`, `easeOutCubic`, `easeOutBack`, `easeInOutSine`, `hex('#rrggbb')`, `mixHex`, `TAU`.

**DOM overlays**: you may add small DOM elements to `ctx.container` (e.g. answer buttons). Use the global classes
`u-game-btn` (pill button) and `u-game-text` (centered caption). Remove them in `destroy()`. Don't add DOM in preview
mode unless purely decorative. Keep them away from the top ~70px (platform HUD + pause/exit buttons).

## 6. Preview (attract) mode — required

In the feed, the centered card mounts your game with `ctx.mode === 'preview'`: input is disabled, audio is muted,
and you must **play yourself** with a ghost player: show the core mechanic clearly within 3 seconds, succeed most
of the time, make an occasional mistake, and loop forever at an early-mid difficulty. Never call `ctx.end()`.
The same code path should drive both modes (the ghost just injects inputs), as in the reference games.

## 7. Quality bar (from PRD §23.1)

- Understandable in 5 seconds; first round fun within 60 s; session 1–5 min; ends with `ctx.end()`.
- Beautiful: cohesive palette from your manifest, soft glow, gentle ambient motion, satisfying feedback on every input
  (visual + `ctx.audio` + `ctx.haptics`). Errors are soft (never harsh buzzers, no red-only).
- Accessibility baseline: no color-only information (use shape/pattern/position/labels too); high-contrast variant
  (`ctx.settings.highContrast`: brighter outlines, no fog/grain); reduced motion (no shake/parallax; essential motion
  only); nothing flashes > 3 Hz; tap targets ≥ 48px; fully keyboard playable; respect `timingMultiplier` for every
  time window; support `noTimePressure` where the ability isn't speed; caption meaningful sounds.
- Performance: no per-frame allocations in hot loops, pool objects, instancing for repeated meshes, particle counts
  scaled by `ctx.quality.particleScale`, keep draw calls modest.
- Clean lifecycle: pause/resume must freeze everything (use ctx.loop/after/wait/tween, never raw timers);
  `destroy()` leaves nothing running.

## 8. Testing your game

The dev server is already running at `http://localhost:5173` (do not start another one; if it is down, start it with
`npx vite --port 5173 --strictPort` in the background).

1. Typecheck (filter to your folders, since other people are editing other folders concurrently):
   `npx tsc --noEmit 2>&1 | grep -E "src/games/(<id1>|<id2>)/" ; echo done`
2. Smoke test in headless Chromium (preview for 5 s, then play mode with random input):
   `node scripts/smoke.mjs <id> --play-ms=8000`
   It prints errors (console errors, exceptions, lab errors) and writes `shots/<id>-preview.png` and
   `shots/<id>-play.png`. **Open the screenshots with the Read tool and judge them critically** — iterate on visuals
   until the game looks polished, readable, and clearly communicates its mechanic. Note headless Chromium runs the
   low quality tier (no bloom), so verify it looks good without postFx.
3. Manually reason through a full session: does it end with `ctx.end()` with sensible stats in 1–5 minutes? Does
   difficulty adapt? Does the ghost loop forever in preview?

The Game Lab is at `/lab?game=<id>&mode=play|preview` (`&autostart=1`, `&level=5`, `&seed=42` supported).

## 9. Voice games (Sarvam AI speech)

`ctx.voice` (see `VoiceApi` in `src/sdk/types.ts`) gives games speech in English (`en-IN`) and Hindi (`hi-IN`):
- `await ctx.voice.speak(text, { lang?, voice?: 'female'|'male', pace?, pan? })`: resolves when playback ends.
  Uses Sarvam AI (bulbul) through the app's `/api/tts` proxy (CDN-cached per phrase), falls back to device speech,
  and no-ops in preview/muted. Calls may overlap (e.g. two voices panned left/right).
- `ctx.voice.prefetch(texts, opts)`: warm upcoming phrases. `ctx.voice.stop()`: stop this game's speech.
- `ctx.voice.source()`: `'sarvam' | 'device' | 'none'`; `ctx.voice.lang()` / `setLang()`.
- Spoken answers: use **`createAnswerBar(ctx)`** from `@/sdk/voiceui` (mic button with level ring, typing fallback,
  consent, captions). `await bar.ask({ prompt, maxMs })` returns the transcript or typed text ('' if nothing).
  `createLangToggle(ctx, onChange)` adds the EN · हि chip. Never call `getUserMedia` directly.
- Matching helpers in `@/sdk/speech`: `normalizeText`, `words`, `similarity`, `heardWord`, `bestMatch`,
  `parseDigits` (handles digits, English and Hindi number words).
- Server: `api/_sarvam.ts` (Vercel Edge functions `api/tts.ts`, `api/stt.ts`); key in `SARVAM_API_KEY`
  (Vercel env, or `.env.local` for `npm run dev`). Without a key, games still work via device speech + typing.
- Designs for the voice games: `docs/VOICE_GAMES.md`. Reference: `src/games/word-echo/`.

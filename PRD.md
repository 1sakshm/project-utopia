# Project Utopia — Product Requirements Document (V1)

| | |
|---|---|
| **Document status** | Draft v1.0 — implementation-ready |
| **Date** | 2026-09-27 |
| **Product** | Project Utopia (working title) |
| **Platform** | Web-first PWA; mobile (iOS Safari, Android Chrome) and desktop (Chrome, Safari, Firefox, Edge) |
| **Audience of this doc** | Founding team: engineering, design, tech art, sound, product, scientific/accessibility advisors |

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Goals and Success Criteria](#2-goals-and-success-criteria)
3. [Target Users](#3-target-users)
4. [Core Principles](#4-core-principles)
5. [V1 Scope](#5-v1-scope)
6. [Discovery and Play Flow](#6-discovery-and-play-flow)
7. [UI/UX Structure](#7-uiux-structure)
8. [Visual and Audio Direction](#8-visual-and-audio-direction)
9. [Technical Stack](#9-technical-stack)
10. [System Architecture](#10-system-architecture)
11. [Game Runtime and SDK](#11-game-runtime-and-sdk)
12. [Feed Preview Architecture](#12-feed-preview-architecture)
13. [Loading, Lifecycle, and State](#13-loading-lifecycle-and-state)
14. [Scoring, Difficulty, and Progress](#14-scoring-difficulty-and-progress)
15. [Settings](#15-settings)
16. [Mobile and PWA](#16-mobile-and-pwa)
17. [Performance Requirements](#17-performance-requirements)
18. [Asset and Licensing Strategy](#18-asset-and-licensing-strategy)
19. [Accessibility Requirements](#19-accessibility-requirements)
20. [Safety, Claims, and Wellbeing](#20-safety-claims-and-wellbeing)
21. [Analytics and Metrics](#21-analytics-and-metrics)
22. [Data Models](#22-data-models)
23. [The V1 Game Catalog (20 Games)](#23-the-v1-game-catalog-20-games)
24. [Development Phases](#24-development-phases)
25. [Build Order for the First 5 Prototypes](#25-build-order-for-the-first-5-prototypes)
26. [V1 Non-Goals](#26-v1-non-goals)
27. [V2 Direction: Open Contribution Platform](#27-v2-direction-open-contribution-platform)
28. [Risks and Mitigations](#28-risks-and-mitigations)
29. [V1 Definition of Done](#29-v1-definition-of-done)
30. [Appendices](#30-appendices)

---

## 1. Product Vision

**Project Utopia is a place where training your mind feels like discovering beautiful little games.**

People scroll short-form video feeds for hours with nothing to show for it. Cognitive and accessibility-focused games, meanwhile, usually look clinical, feel like homework, and hide behind signup walls. Utopia takes the one thing short-form feeds get right, which is effortless discovery, and points it at something better: short, gorgeous, instantly playable games that each exercise a real ability, like working memory, attention, rhythm, planning, reading, or calm focus.

You open Utopia and a living game is already moving on screen. Swipe up and another one appears. Tap **Play** and you're in the game in about a second. Tap **Exit** and you're back at the exact card you left, ready to keep exploring.

### 1.1 Vision statement

> A premium, joyful, accessible arcade of short cognitive games, discoverable like reels, playable in seconds, and honest about what they do.

### 1.2 What Utopia should feel like

- **Monument Valley / Alto's Odyssey**: calm, considered, beautiful geometry and light.
- **Apple Arcade**: polish, respect for the player, no ads, no manipulation.
- **Award-winning WebGL portfolios**: tactile, alive, with small surprises and satisfying micro-interactions.
- **Not** a hospital portal, a school worksheet, or a "brain age" quiz.

### 1.3 Positioning

| Utopia is | Utopia is not |
|---|---|
| A collection of short, replayable, skill-based games | A medical device, diagnostic tool, or therapy |
| Designed *around* specific cognitive abilities | A promise that playing will "boost IQ" or "prevent decline" |
| Discovery-first, zero-friction | An engagement-maximizing infinite feed |
| Accessible by default | An afterthought "accessibility mode" |
| A future home for community-contributed games (V2) | A social network |

---

## 2. Goals and Success Criteria

### 2.1 Product goals (V1)

| # | Goal | Measure (see §21) |
|---|---|---|
| G1 | Make cognitive games people *want* to play | Preview→Play rate ≥ 35%; replay rate ≥ 45% |
| G2 | Remove friction between curiosity and play | Median time from app open to first gameplay input ≤ 8 s; time-to-interactive per game ≤ 1.5 s warm / ≤ 3 s cold on 4G |
| G3 | Deliver 20 distinct, polished games | All 20 pass the Game Quality Bar (§23.1) |
| G4 | Be genuinely accessible | WCAG 2.2 AA for platform UI; every game ships with the Accessibility Baseline (§19.3) |
| G5 | Run smoothly on mainstream phones | ≥ 55 fps p50 / ≥ 45 fps p10 on reference mid-tier devices (§17) |
| G6 | Encourage healthy, meaningful use | Meaningful Play Sessions/week as the north star, not time-on-app (§21.1) |
| G7 | Build a reusable platform | All 20 games run on one SDK without platform-level special cases |

### 2.2 Business goals (V1)

- Validate that reels-style discovery increases trial of cognitive games vs. a conventional grid.
- Build a portfolio-grade product that attracts contributors (researchers, designers, developers) for V2.
- Establish a trusted brand: no ads, no dark patterns, no pseudo-scientific claims.

---

## 3. Target Users

### 3.1 Primary personas

**P1 — "The Curious Scroller" (Maya, 24)**
Plays mobile games casually and scrolls reels daily. Wants something that feels better than doomscrolling. Won't sign up to try something. Needs instant fun, beauty, and short sessions.

**P2 — "The Deliberate Practicer" (Arjun, 38)**
Interested in focus, memory, and mental sharpness. Has tried brain-training apps and found them repetitive or patronizing. Wants variety, visible personal progress, and honesty.

**P3 — "The Accessibility-First Player" (Sam, 29, low vision; or Lena, 17, dyslexic)**
Often excluded by games that rely on color alone, small targets, fast timing, or dense text. Needs configurable contrast, timing, text, motion, and audio, and to be treated as a normal player, not a patient.

**P4 — "The Calm Seeker" (Priya, 45)**
Wants short, low-pressure experiences to reset attention during a busy day. Prefers soft visuals, no timers, gentle sound.

### 3.2 Secondary users

- **Educators and therapists** who may *recommend* games informally. V1 gives them a clear "About the science" page and per-game ability descriptions. It does **not** offer clinical tooling.
- **Parents** of older children and teens. V1 is rated for general audiences, with no accounts required and no user-generated content.
- **Future contributors (V2)**: researchers, developers, designers, students, therapists, accessibility specialists.

### 3.3 Age policy

- V1 is designed for **ages 13+** for accounts (COPPA/GDPR-K compliance by not collecting personal data from under-13s).
- Anonymous play needs no personal data, so the game content is suitable for all ages.
- The sign-in flow includes an age gate. Users under 13 continue anonymously with local-only storage.

---

## 4. Core Principles

1. **Beauty is a feature.** Every game must look good enough to be screenshotted and shared. A clinical look is treated as a bug.
2. **Understandable in 5 seconds.** A new player must grasp the goal from the preview plus one micro-hint. No text walls.
3. **Play in 1 second.** Tap Play and see the game immediately. Loading is hidden behind the transition.
4. **Always return home.** Exit always restores the exact feed position, scroll state, and preview.
5. **Short loops, deep mastery.** Rounds last 30–120 s and sessions 2–5 min, with adaptive difficulty that stays in the "flow band."
6. **Accessible by default.** Accessibility settings are global, respected by every game, and never gated.
7. **Honest science.** We say what a game is *designed around*, never what it *cures*.
8. **Respect attention.** We optimize for meaningful play, not time-on-app. No streak guilt, no infinite autoplay of audio, no manipulative notifications.
9. **One platform, many games.** Shared SDK, shared chrome, shared FX, and a shared sound palette give a cohesive identity and fast production.
10. **Performance is design.** A beautiful game that stutters on a mid-range phone is not beautiful.

---

## 5. V1 Scope

### 5.1 In scope

| Area | V1 deliverable |
|---|---|
| Discovery | Vertical reels feed of 20 game cards with live/animated previews, snap scrolling, keyboard/mouse/touch support |
| Play | Instant full-screen play overlay, shared pause/exit/restart chrome, results screen, return to exact feed position |
| Games | 20 original games (§23) on a shared SDK |
| Library | Grid/list of all games filterable by ability, with favorites |
| Progress | Personal bests, levels, per-ability practice summary, recent sessions |
| Settings | Global accessibility, audio, motion, haptics, timing, text, and data settings |
| Accounts | Anonymous-first (local storage); optional sign-in to sync across devices |
| PWA | Installable, offline shell, offline play for previously loaded games |
| Game detail page | Shareable URL per game: description, ability, how to play, science note, credits |
| About/Science | Plain-language claims policy, ability glossary, references |
| Analytics | Privacy-respecting product analytics and performance telemetry |
| Admin (internal) | Catalog config (feed order, feature flags, game enable/disable) through config files plus a simple DB table; no custom CMS |

### 5.2 Out of scope (see §26 for full non-goals)

Multiplayer, chat, comments, social feeds, leaderboards with strangers, monetization, ads, native app-store builds, clinical dashboards, user-generated content, and the third-party game submission pipeline (V2).

---

## 6. Discovery and Play Flow

### 6.1 Flow overview

```
 ┌──────────────┐   swipe/scroll   ┌──────────────┐
 │  Feed Card N │ ───────────────► │ Feed Card N+1│  (live preview, looping attract mode)
 └──────┬───────┘                  └──────────────┘
        │ tap PLAY
        ▼
 ┌────────────────────────────────────────────────────┐
 │ Transition (≤ 450 ms): card preview expands to     │
 │ full screen; game module mounts behind the scrim   │
 └──────┬─────────────────────────────────────────────┘
        ▼
 ┌─────────────┐  first time only  ┌──────────────┐
 │ Ready state │ ────────────────► │ Micro-tutorial│ (≤ 10 s, skippable, interactive)
 └──────┬──────┘                   └──────┬───────┘
        ▼                                 ▼
 ┌────────────────────────────────────────────────────┐
 │ PLAYING  ⇄  PAUSED (pause button / Esc / tab hidden)│
 └──────┬─────────────────────────────────────────────┘
        │ round/session ends
        ▼
 ┌────────────────┐   Play again   ┌─────────┐
 │ Results screen │ ─────────────► │ PLAYING │
 └──────┬─────────┘                └─────────┘
        │ Exit (or Exit from any state)
        ▼
 ┌────────────────────────────────────────────────────┐
 │ Reverse transition (≤ 350 ms) → Feed Card N,        │
 │ same scroll position, preview resumes, card shows   │
 │ updated "Best" badge                                │
 └────────────────────────────────────────────────────┘
```

### 6.2 Detailed flow requirements

**F-1 Cold open.**
- The first card is visible and animating within 2.5 s (LCP) on a 4G mid-tier phone.
- On first visit, the first card shows a subtle one-time coach mark ("Swipe up to discover · Tap Play to play"), dismissed on first interaction.
- No signup wall, cookie wall, or splash screen longer than 600 ms. The consent banner is non-blocking and minimal (only needed if non-essential analytics are enabled in the region).

**F-2 Scrolling the feed.**
- Vertical pager with snap-to-card. One card equals one viewport (`100dvh`).
- Inputs: touch swipe (velocity-aware, with a flick threshold), mouse wheel/trackpad (debounced, one card per gesture), keyboard (`↑`/`↓`, `J`/`K`, `PageUp`/`PageDown`), and on-screen up/down buttons on desktop.
- The centered card goes "active": its live preview starts (or its video loop plays) within 150 ms of snapping.
- Audio in previews is **off by default**. A global feed-sound toggle on the card rail enables ambient preview audio (low volume, ducked).

**F-3 Feed composition.**
- The V1 feed is a *finite, curated sequence* of the 20 games, reordered lightly per user (§6.4).
- After card 20, an **"You've seen them all"** interstitial card offers: *Replay a favorite · Browse Library · Today's Daily Seeds*. Scrolling past it starts the feed again with **Daily Seed** variants (same games, today's deterministic seed, "Daily" badge).
- Occasional **utility cards** (at most 1 per 8 game cards): "Continue where you left off," "New personal best in Echo Garden — try level 9?", "Take a breath" (links to Still Water after 20+ min continuous use).

**F-4 Tapping Play.**
- Play is a single tap on a large primary button (≥ 56×56 px). Tapping the preview area itself does **not** start play, to avoid accidental starts while scrolling. Tapping the preview area shows the "how it plays" micro-hint.
- The tap is also the user gesture that unlocks the `AudioContext` (important for iOS).
- The game chunk has usually been prefetched already (§13.2), so the transition only hides mount time.
- The transition is a shared-element expansion: the preview canvas/video scales to full screen, the card UI fades, and platform chrome (Pause, Exit) fades in.
- URL updates to `/play/:gameSlug` via `history.pushState`, so the system back gesture/button maps to Exit.

**F-5 Micro-tutorial (first play only).**
- Interactive, ≤ 10 s, one mechanic at a time, with ghost hand/cursor animation and ≤ 8 words of text per step.
- Skippable. Available again later from the pause menu under "How to play."
- Completion is stored per game.

**F-6 Playing.**
- Platform chrome is minimal: top-left **Exit (✕)**, top-right **Pause (❚❚)**. Both are ≥ 44×44 px with safe-area insets and translucent backing for contrast.
- Games render the in-game HUD (score, level, timer) through SDK-provided HUD components so typography and style stay consistent.
- Auto-pause on: tab hidden, window blur (desktop), orientation change, app backgrounded, audio interruption (phone call), and WebGL context loss.

**F-7 Pause menu.** Resume · Restart · How to play · Game settings (per-game toggles plus a shortcut to global accessibility) · Exit.

**F-8 Results screen.**
- Shared template: score, level reached, personal-best comparison, 1–3 game-specific stats (for example "Longest sequence: 9", "Average reaction: 312 ms"), and a single encouraging, non-judgmental line.
- Actions: **Play again** (primary), **Exit to feed**, **Next game** (secondary, jumps to the next feed card and starts its preview, *not* auto-play).
- No "brain age," percentile vs. population, or IQ-like composite.

**F-9 Exit.**
- Available at every state, including loading. Exit during play asks for no confirmation unless a round is > 60 s in progress, in which case a small inline "Exit? Progress for this round won't be saved" appears with Exit/Stay. This confirmation can be disabled in settings.
- The game instance is fully destroyed (§13.4). The feed restores the same card index, the preview resumes from a poster frame captured at entry, and the "Best" badge on the card animates if it changed.
- Target: feed interactive ≤ 350 ms after tapping Exit.

**F-10 Deep links.**
- `/game/:slug` opens the game detail page with a Play button. Shared links land here.
- `/play/:slug` opens the game directly. If the user refreshes mid-game, the game restarts from its ready state and Exit returns to the feed positioned at that game's card.
- `/?card=:slug` opens the feed positioned at that card.

### 6.3 Exact-position restoration (technical requirement)

- Feed state `{ orderedIds, activeIndex, cycle, seedVariant }` lives in a Zustand store persisted to `sessionStorage` on every snap.
- The feed component **stays mounted** during play, hidden with `visibility:hidden` + `inert`, and its live preview is destroyed. Only the DOM and virtual window are retained.
- On Exit, the store index is authoritative. The pager renders at that index without animation, then the preview mounts.
- On hard reload, the pager restores from `sessionStorage`. If absent, it uses the URL `card` param. Otherwise it starts at index 0.

### 6.4 Feed ordering (V1: simple, transparent, non-addictive)

The ordering is deterministic and rule-based, with no engagement-optimizing ML in V1:

1. **Editorial base order** (config): alternates abilities, energy levels (calm ↔ intense), and engines so consecutive cards feel different.
2. **Light personalization**:
   - Unplayed games get pulled slightly forward (at most 3 positions).
   - Favorites appear once in the first 8 cards.
   - Games exited within 5 s twice in a row get pushed back (the user signaled disinterest).
   - Never place two games targeting the same primary ability adjacent to each other.
3. **Accessibility-aware filtering (opt-in)**: if a user enables "Hide games that require fast reactions" or "Hide audio-dependent games," those cards move to the end with an explanation instead of being silently removed.

---

## 7. UI/UX Structure

### 7.1 Information architecture

```
Utopia
├── Feed (/)                       ← default tab
├── Library (/library)
│   └── filters: ability · energy (calm/active) · length · accessibility tags
├── Game detail (/game/:slug)
├── Play overlay (/play/:slug)     ← full-screen layer above everything
├── Progress (/progress)
│   ├── Practice summary by ability
│   ├── Personal bests
│   └── Recent sessions
├── Settings (/settings)
│   ├── Accessibility
│   ├── Audio & haptics
│   ├── Gameplay (timing, confirmations)
│   ├── Account & data
│   └── About · Science & claims · Credits · Privacy
└── Onboarding (first-visit coach marks only)
```

### 7.2 Navigation

- **Mobile**: translucent bottom tab bar with 4 items: **Feed · Library · Progress · Settings**. It hides during play and auto-hides after 3 s of feed idleness, reappearing on any touch.
- **Desktop (≥ 1024 px)**: the feed is a centered 9:16 column (max height 100vh, max width ~ 56.25vh) with a **left rail** (logo + nav) and a **right info panel** that shows the active game's description, ability, how-to-play, controls, and best score. The page background is an ambient blurred, color-graded extension of the active preview (a cheap CSS gradient from the game's palette tokens, not a second WebGL context).
- **Tablet**: mobile layout with the column widened to max 600 px.

### 7.3 Feed card anatomy

```
┌───────────────────────────────┐
│ [Daily] badge (optional)   🔈 │ ← feed-sound toggle (top-right)
│                               │
│                               │
│      LIVE GAME PREVIEW        │   full-bleed; safe area aware
│   (attract mode / ghost play) │
│                               │
│                           ♡   │ ← favorite
│                           ⓘ   │ ← info sheet
│                               │
│  ◎ Working memory             │ ← ability chip (icon + text, never color-only)
│  Echo Garden                  │ ← title (display font)
│  Repeat the song the garden   │ ← one-line hook (≤ 60 chars)
│  sings. ~3 min · Best 11      │ ← session length + personal best
│                  ┌─────────┐  │
│                  │ ▶ PLAY  │  │ ← primary button, 56px+ tall
│                  └─────────┘  │
└───────────────────────────────┘
```

- Text sits on a bottom gradient scrim (min contrast 4.5:1 guaranteed through the scrim and a text shadow).
- The **info sheet** (bottom sheet on mobile, right panel on desktop) contains: what you do, what it's designed around (ability), controls, accessibility tags (e.g. "No time pressure option," "Playable without sound," "Color-independent"), session length, and credits.

### 7.4 Play overlay anatomy

- Full screen, `position: fixed`, above feed and nav. Uses `100dvh` and `env(safe-area-inset-*)`.
- **Game safe area**: every game designs for a 9:16 portrait "safe play rect." On other aspect ratios, the play rect is centered and scaled, and the game renders decorative "ambient extension" beyond it (sky, particles, fog) so there are no letterbox bars. The SDK supplies `layout.safeRect` and `layout.fullRect`.
- Landscape on phones: supported for games flagged `orientation: "any"`. Others show the same safe rect centered with ambient extension. We never force rotation.

### 7.5 Progress screen

- **Ability rings**: one ring per ability category (Memory, Attention, Perception, Reasoning & Planning, Language, Flexibility & Control, Timing & Coordination, Calm). A ring fills based on *practice minutes this week* against a gentle, user-adjustable goal (default: none; the rings then just show activity). Rings measure practice, **not** ability level.
- **Personal bests** per game with sparkline history (last 20 sessions).
- **Recent sessions** list.
- Copy is always self-referenced ("Your best," "Your last 7 days"), never compared with other people.

### 7.6 Design system

- Tokens (in `packages/ui/tokens`): color (per-theme plus per-game accent sets), type scale, spacing (4 px base), radii (12/20/28/full), elevation (glass layers), motion durations/easings, z-layers.
- Components: `Button`, `IconButton`, `Chip`, `Sheet`, `Dialog`, `Toggle`, `Slider`, `SegmentedControl`, `Toast`, `Card`, `Ring`, `Sparkline`, `HUDScore`, `HUDTimer`, `HUDLevel`, `ResultsPanel`, `CoachMark`.
- Built with React plus CSS Modules or vanilla-extract. Headless primitives come from Radix UI for accessible dialogs, sheets, and toggles.
- Iconography: custom rounded 2 px-stroke set (based on Lucide, MIT) plus bespoke ability glyphs.

### 7.7 Micro-interactions and motion language

- **Easing**: `cubic-bezier(0.22, 1, 0.36, 1)` (easeOutQuint) for entrances; spring (stiffness 300, damping 30) for tactile presses.
- **Buttons**: press scales to 0.96, a soft light bloom on release, a 10 ms haptic tick (where supported and enabled).
- **Card snap**: a slight parallax between the preview and the text layer while dragging.
- **Reduced motion**: all transitions become 150 ms crossfades, parallax is disabled, and previews switch to a still poster with a slow Ken Burns effect or none at all (user choice).

---

## 8. Visual and Audio Direction

### 8.1 Visual identity: "Luminous Minimalism"

**Core idea:** each game is a small, glowing world floating in soft darkness, lit from within. Simple geometry, rich light.

| Element | Direction |
|---|---|
| **Backgrounds** | Deep, desaturated gradients (ink blue, plum, forest, warm charcoal). Never pure black (#0B0D14-style bases) so glow and bloom read well. A light theme exists for platform UI. Games may offer a "day" palette for high-contrast/light preference. |
| **Light** | Emissive materials, soft bloom, rim light, gentle volumetric fog, subtle film grain (≤ 3% opacity, off in high-contrast mode). |
| **Geometry** | Rounded primitives, low-poly with smooth shading, isometric or three-quarter cameras, generous negative space. |
| **Color** | Each game gets a 5-color signature palette (2 base, 2 accent, 1 highlight) drawn from a shared master palette so the catalog feels like one family. All palettes are validated for CVD safety, and gameplay-critical distinctions always use shape/pattern/position *plus* color. |
| **Typography** | Display: **Fraunces** (OFL, soft optical serif) for game titles and results headlines. UI: **Manrope** (OFL) for everything else. Dyslexia-friendly option: **Atkinson Hyperlegible** (OFL) or **OpenDyslexic** (OFL) as a global toggle. |
| **Particles** | Used for feedback (success bursts, trails) and ambience (motes, fireflies). Capped by quality tier. |
| **UI surfaces** | Frosted glass (backdrop blur 20 px where supported, solid fallback), hairline borders at 8% white. |
| **Motion** | Slow ambient motion (breathing, drifting) plus snappy, satisfying feedback. |

**Visual references (for mood boards, not for copying):** Monument Valley 1–2, Alto's Odyssey, Sky: Children of the Light, Gris, Mini Metro, Lumino City, Bruno Simon's portfolio, Active Theory work, and Apple's "Shot on iPhone" lighting aesthetic.

### 8.2 Audio identity: "One Orchestra"

- All platform and game sounds are tuned to a shared harmonic system: each game has a **home key** and a **pentatonic scale**, so correct-answer tones always sound pleasant and consistent. The platform UI uses D major pentatonic.
- The UI sound kit (tap, swipe tick, play whoosh, exit, success, gentle error) is short (≤ 150 ms), soft, and never harsh. **Error sounds are never buzzers.** They are low, muted "thunks" or descending two-note figures.
- Music: sparse ambient beds per game (loopable, 60–120 s, crossfaded), mixed quietly. Music ducks under SFX.
- Implementation: a shared Web Audio engine (`@utopia/audio`) with three buses (Music, SFX, Voice) plus master, a compressor/limiter on master, spatial panning helpers, and procedural synth voices (for sequence/rhythm games) to minimize asset weight.
- Haptics: `navigator.vibrate` on Android (short patterns). iOS Safari doesn't support vibration, so we degrade gracefully with no fallback expectation.

---

## 9. Technical Stack

Chosen for a **small team (2–4 engineers)** building from scratch, prioritizing developer velocity, reuse, and mobile performance.

### 9.1 Recommended stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** (strict) | One language across platform, SDK, and games |
| Monorepo | **pnpm workspaces + Turborepo** | Per-package builds and caching; games as isolated packages |
| App framework | **Vite + React 19 SPA** with **TanStack Router** | The app is a client-heavy, canvas-centric experience; SSR adds little. Vite gives fast HMR and chunking. Static prerendering for `/game/:slug` pages covers SEO/share previews. |
| Static prerender / OG | `vite-plugin-ssg`-style prerender for `/`, `/game/*`, `/about`; OG images generated at build | SEO and link previews without an SSR server |
| State | **Zustand** (+ `persist` middleware) | Tiny, simple, works outside React (games can read settings without React) |
| Styling | **vanilla-extract** or CSS Modules + design tokens | Zero-runtime CSS; themeable |
| UI primitives | **Radix UI** | Accessible dialogs, sheets, toggles, sliders |
| Animation (UI) | **GSAP** (free for all uses since 2025, including plugins) + **Motion** (`motion/react`) for React layout transitions | GSAP for timelines/shared-element transitions; Motion for component-level springs |
| Gestures | `@use-gesture/react` | Feed pager drag/flick |
| **3D engine** | **Three.js** via **React Three Fiber** + **drei** + **@react-three/postprocessing** | Declarative 3D, huge ecosystem, fast iteration |
| **2D engine** | **PixiJS v8** (WebGL2/WebGPU renderer) | Fast 2D sprites, particles, filters; small and flexible |
| Canvas 2D | Native Canvas API | For very simple scenes and fallbacks |
| Physics (where needed) | **Rapier** (`@react-three/rapier`, WASM) for 3D; lightweight custom kinematics for 2D | Deterministic, fast |
| Phaser | **Not a default in V1.** Allowed only if a specific game needs its scene/physics stack and the bundle cost is justified. | Keeping to two primary renderers (R3F + Pixi) halves engine-specific tooling, perf work, and bugs |
| Audio | Custom `@utopia/audio` on Web Audio API; **Tone.js** only for Tidal Beat's transport scheduling (lazy-loaded) | Precise timing, tiny core |
| Shaders | GLSL via `vite-plugin-glsl`; shared shader chunks (noise, gradients, fresnel, dissolve) | Reuse across games |
| Assets | glTF/GLB with **Meshopt** or **Draco**; textures in **KTX2 (Basis Universal)**; sprites as **AVIF/WebP atlases**; audio in **Opus (WebM) + AAC (m4a)** | Mobile GPU memory and bandwidth |
| GPU tiering | `detect-gpu` + runtime FPS governor | Quality tiers |
| Local persistence | **IndexedDB** via `idb-keyval`/Dexie | Anonymous progress, offline |
| Backend | **Supabase** (Postgres, Auth, Row Level Security, Storage, Edge Functions) | Minimal ops; SQL; generous free tier; easy to replace |
| Hosting/CDN | **Cloudflare Pages** (or Vercel) + CDN for assets with immutable hashed URLs | Global edge, cheap bandwidth |
| PWA | `vite-plugin-pwa` (Workbox) | Service worker, precache, runtime caching |
| Analytics | **PostHog** (EU cloud or self-hosted), cookieless mode by default | Product analytics, feature flags, privacy controls |
| Errors & perf | **Sentry** (browser SDK, sampled) + custom Web Vitals + in-game FPS telemetry | Crash and perf visibility |
| Testing | **Vitest** (unit), **Playwright** (E2E, visual regression, preview capture), **axe-core** (a11y) | CI confidence |
| CI/CD | GitHub Actions: typecheck, lint, test, bundle-size budgets, asset-license check, preview capture, deploy previews per PR | Guardrails for a small team |
| Code quality | ESLint (flat config), Prettier, `knip` for dead code, Changesets for SDK versioning | |

### 9.2 Why not Next.js / native apps / Unity WebGL?

- **Next.js**: SSR/RSC complexity with little benefit for a canvas-first app. Prerendering covers SEO. Reconsider in V2 for the contributor portal.
- **Native apps**: the PWA reaches both platforms with one codebase. Capacitor wrapping stays possible in V2 without a rewrite.
- **Unity/Godot WebGL exports**: large initial downloads (5–30 MB), slow startup, and poor fit for instant feed previews. They don't meet "play in 1 second."

---

## 10. System Architecture

### 10.1 High-level diagram

```
┌──────────────────────────────── Browser / PWA ────────────────────────────────┐
│                                                                               │
│  ┌──────────── App Shell (React) ─────────────┐   ┌─── Service Worker ─────┐  │
│  │ Router · Feed · Library · Progress ·       │   │ precache shell          │  │
│  │ Settings · Play Overlay · Design System    │   │ runtime cache: games,   │  │
│  └───────┬──────────────────────┬─────────────┘   │ assets, previews        │  │
│          │                      │                 └─────────────────────────┘  │
│  ┌───────▼─────────┐   ┌────────▼──────────────────────────────┐              │
│  │ Platform Stores │   │ Game Host (@utopia/runtime)            │              │
│  │ (Zustand)       │◄──┤  - module loader + LRU cache           │              │
│  │ settings, feed, │   │  - lifecycle state machine             │              │
│  │ progress, user  │   │  - GameContext factory                 │              │
│  └───────┬─────────┘   │  - input, audio, layout, quality, RNG  │              │
│          │             │  - event bus → scoring/progress/analytics│             │
│  ┌───────▼─────────┐   └────────┬──────────────────────────────┘              │
│  │ Persistence     │            │ mount(ctx) / mountPreview(ctx)               │
│  │ IndexedDB (local│   ┌────────▼───────────────────────────────┐             │
│  │ first) ⇄ Sync   │   │ Game Modules (lazy chunks)              │             │
│  └───────┬─────────┘   │ games/echo-garden, games/night-harbor…  │             │
│          │             │ each: manifest + game entry + preview   │             │
│          │             │ entry + assets                          │             │
│          │             └─────────────────────────────────────────┘             │
└──────────┼────────────────────────────────────────────────────────────────────┘
           │ HTTPS (sync, auth)                 │ HTTPS (static assets, hashed)
┌──────────▼──────────────┐              ┌──────▼──────────────────┐
│ Supabase                │              │ CDN (Cloudflare)        │
│ Auth · Postgres (RLS) · │              │ app shell, game chunks, │
│ Edge Functions (sync,   │              │ KTX2/GLB/audio, preview │
│ config)                 │              │ videos & posters        │
└─────────────────────────┘              └─────────────────────────┘
           │
┌──────────▼──────────┐   ┌─────────────┐
│ PostHog (analytics, │   │ Sentry      │
│ feature flags)      │   │ (errors)    │
└─────────────────────┘   └─────────────┘
```

### 10.2 Monorepo layout

```
utopia/
├── apps/
│   └── web/                      # React app shell (feed, library, play overlay…)
├── packages/
│   ├── sdk/                      # @utopia/sdk — public types + helpers for game authors
│   ├── runtime/                  # @utopia/runtime — game host, lifecycle, loader
│   ├── ui/                       # @utopia/ui — design system + HUD components
│   ├── audio/                    # @utopia/audio — Web Audio engine, buses, synths
│   ├── fx/                       # @utopia/fx — shared shaders, postprocessing presets,
│   │                             #   particle systems (R3F + Pixi variants), palettes
│   ├── input/                    # @utopia/input — unified pointer/keyboard/gesture
│   ├── difficulty/               # @utopia/difficulty — staircases, skill rating
│   ├── r3f-kit/                  # shared R3F helpers: camera rigs, quality-aware Canvas,
│   │                             #   instanced helpers, disposal utils
│   ├── pixi-kit/                 # shared Pixi helpers: app factory, atlases, tween bridge
│   ├── content/                  # word lists, phoneme data, seeds (for language games)
│   ├── analytics/                # typed event schema + PostHog adapter
│   └── config/                   # eslint, tsconfig, vite presets
├── games/
│   ├── echo-garden/
│   │   ├── src/manifest.ts
│   │   ├── src/game.ts           # mount()
│   │   ├── src/preview.ts        # mountPreview()
│   │   ├── src/ghost.ts          # scripted ghost player (preview + smoke tests)
│   │   ├── src/logic/            # pure, engine-free game logic (unit-tested)
│   │   ├── src/view/             # rendering (R3F or Pixi)
│   │   ├── assets/               # source assets + LICENSES.json
│   │   └── tests/
│   └── … (20 games)
├── tools/
│   ├── preview-capture/          # Playwright → MP4/WebM/AVIF poster pipeline
│   ├── asset-pipeline/           # gltf-transform, toktx/basisu, ffmpeg, atlas packing
│   ├── license-check/            # CI: every asset has a license record
│   └── game-scaffold/            # `pnpm new-game <slug> --engine r3f|pixi`
└── docs/
    ├── PRD.md
    ├── sdk.md
    ├── game-design-template.md
    └── claims-policy.md
```

**Architectural rule:** a game package may import only `@utopia/sdk`, `@utopia/fx`, `@utopia/audio` (through the context), `@utopia/r3f-kit` / `@utopia/pixi-kit`, and `@utopia/ui/hud`. It may **not** import app stores, the router, or other games. This keeps V2's sandboxed third-party runtime possible (§27.4). ESLint `no-restricted-imports` plus dependency-cruiser enforce it in CI.

### 10.3 Game logic / view separation

Each game has:

- `logic/`: pure TypeScript state machine (round generation, rules, scoring, difficulty inputs), deterministic from a seed, fully unit-tested, and engine-agnostic.
- `view/`: rendering and input mapping in R3F or Pixi.
- `ghost.ts`: a scripted player driving `logic/` (with configurable skill/error rate) used by **preview attract mode**, **automated smoke tests**, and **difficulty simulation** (checking that the adaptive curve behaves).

---

## 11. Game Runtime and SDK

### 11.1 Responsibilities split

| Platform (runtime) owns | Game owns |
|---|---|
| Loading, mounting, destroying | Rendering inside the provided container |
| Pause/exit/restart chrome and menus | Gameplay, in-game HUD content via SDK HUD components |
| Results screen UI | Producing the results summary data |
| Settings (global + per-game storage) | Reacting to settings changes live |
| Audio context, buses, unlock | Playing sounds through the provided audio API |
| Input normalization | Mapping normalized input to game actions |
| Quality tier, DPR cap, resize | Honoring tier (particle counts, postprocessing) |
| Difficulty persistence & starting level | Applying the level; reporting trial outcomes |
| Analytics transport | Emitting typed game events |
| Error boundary, context-loss handling | Cleaning up in `destroy()` |

### 11.2 Manifest

```ts
// @utopia/sdk
export type Ability =
  | 'working-memory' | 'spatial-memory' | 'selective-attention'
  | 'sustained-attention' | 'divided-attention' | 'visual-processing'
  | 'spatial-reasoning' | 'pattern-recognition' | 'phonological-awareness'
  | 'reading-fluency' | 'cognitive-flexibility' | 'inhibition'
  | 'reaction-timing' | 'visuomotor-coordination' | 'planning'
  | 'rhythm-timing' | 'calm-attention';

export interface GameManifest {
  id: string;                    // 'echo-garden'
  version: string;               // semver; bump invalidates cached chunks
  title: string;
  hook: string;                  // ≤ 60 chars, feed card line
  description: string;           // info sheet / detail page
  abilities: { primary: Ability; secondary?: Ability[] };
  engine: 'r3f' | 'pixi' | 'canvas2d' | 'dom';
  energy: 'calm' | 'focused' | 'active';
  sessionLengthSec: { min: number; typical: number; max: number };
  orientation: 'portrait' | 'any';
  input: {
    pointer: true;               // all games must support pointer/touch
    keyboard: boolean;           // all V1 games: true
    requiresAudio: boolean;      // gameplay depends on sound?
    requiresFastReaction: boolean;
    requiresColorDiscrimination: false; // must be false in V1
  };
  accessibility: {
    relaxedTiming: boolean;      // supports timing multiplier
    noTimePressureMode: boolean;
    audioOnlyPlayable: boolean;  // playable by sound alone
    visualOnlyPlayable: boolean; // playable with sound off
    oneHanded: boolean;
    photosensitivitySafe: true;  // must be true
    notes: string[];
  };
  palette: { bg: string; bg2: string; accent: string; accent2: string; highlight: string };
  media: { poster: string; previewVideo: { mp4: string; webm: string }; ogImage: string };
  entry: {
    game: () => Promise<{ default: GameFactory }>;
    preview: () => Promise<{ default: PreviewFactory }>;
  };
  assets: AssetManifest;         // grouped: 'preview' | 'core' | 'deferred'
  hud: Array<'score' | 'level' | 'timer' | 'lives' | 'progress'>;
  results: ResultStatDef[];      // which stats the results screen shows
  credits: Credit[];
}
```

### 11.3 Factories and instance interface

```ts
export type GameFactory = (ctx: GameContext) => Promise<GameInstance>;
export type PreviewFactory = (ctx: PreviewContext) => Promise<PreviewInstance>;

export interface GameInstance {
  /** Called once after mount & assets loaded. Begin intro/countdown. */
  start(opts: StartOptions): void;
  pause(): void;                     // must freeze sim, timers, audio scheduling
  resume(): void;
  restart(): void;                   // new session, same instance (no reload)
  setSettings(s: EffectiveSettings): void;   // live updates (contrast, motion…)
  resize(layout: Layout): void;
  /** Free GPU/audio/listeners. Must resolve ≤ 100 ms. */
  destroy(): Promise<void>;
}

export interface StartOptions {
  mode: 'normal' | 'tutorial' | 'daily';
  seed: number;
  startLevel: number;               // from difficulty service
  skill: SkillState | null;
}

export interface PreviewInstance {
  play(): void;                     // start/resume attract loop
  pause(): void;
  captureFrame(): Promise<ImageBitmap | null>; // for seamless return poster
  destroy(): Promise<void>;
}
```

### 11.4 GameContext

```ts
export interface GameContext {
  container: HTMLElement;            // game renders into this
  layout: Layout;                    // { fullRect, safeRect, dpr, orientation }
  settings: EffectiveSettings;       // merged global + per-game
  quality: QualityProfile;           // tier, maxDpr, particlesScale, postFx, shadows
  audio: GameAudio;                  // buses, play(sfx), synth(note), music(track)
  input: InputApi;                   // normalized pointer/keyboard/actions
  assets: AssetLoader;               // load(group), get(key); cached, abortable
  rng: SeededRng;                    // deterministic per session seed
  clock: GameClock;                  // pause-aware time, rAF scheduler
  hud: HudApi;                       // set('score', 120), flash('level', 3)
  difficulty: DifficultyApi;         // staircase helpers + record(trial)
  storage: GameStorage;              // per-game KV (tutorialDone, unlocked themes)
  haptics: HapticsApi;               // tick(), success(), error() → no-op if disabled
  a11y: A11yApi;                     // announce(text) → ARIA live region; captions
  emit: <E extends GameEvent>(e: E) => void;  // typed event bus
  signal: AbortSignal;               // aborted on destroy
}
```

### 11.5 Game events (typed, serializable)

```ts
type GameEvent =
  | { type: 'ready' }
  | { type: 'tutorial_complete' }
  | { type: 'round_start'; round: number; level: number }
  | { type: 'trial'; correct: boolean; rtMs?: number; level: number; meta?: Record<string, number|string|boolean> }
  | { type: 'round_end'; round: number; score: number; accuracy?: number; level: number }
  | { type: 'session_end'; summary: SessionSummary }   // triggers results screen
  | { type: 'request_pause' }                          // e.g. game-specific pause key
  | { type: 'error'; message: string; fatal: boolean };

interface SessionSummary {
  score: number;
  levelReached: number;
  durationMs: number;
  stats: Record<string, number>;     // keyed by manifest.results defs
  skillUpdate?: SkillState;
  completed: boolean;                // reached natural end vs. exited
}
```

All events must be JSON-serializable (no functions, DOM nodes, or class instances), so they can later cross an iframe `postMessage` boundary unchanged.

### 11.6 Input API

- **Pointer**: unified `pointerdown/move/up` with `event.timeStamp` preserved for RT measurement; `touch-action: none` on the game container; multi-touch available (`pointers` map).
- **Actions**: games declare an action map, e.g. `{ primary: ['Space','Enter'], left: ['ArrowLeft','KeyA'], ... }`. The runtime emits `action` events regardless of the source (key, on-screen button, switch access).
- **Switch/one-button access**: every game must be completable with pointer-only *and* keyboard-only. Games flagged `oneHanded` must work with a single thumb in the lower two-thirds of the screen.
- iOS protections: prevents double-tap zoom, long-press callout, text selection, and pull-to-refresh inside the play overlay.

### 11.7 Shared kits

- **`@utopia/r3f-kit`**: `<UtopiaCanvas>` (quality-aware DPR, `frameloop` control, pause integration, automatic disposal, context-loss handling), camera rigs (isometric, orbit-idle), `useInstancedPool`, `usePauseAwareFrame`, `EmissivePulse`, `SoftShadows` presets, and the postprocessing preset (Bloom + Vignette + Noise + SMAA, tiered).
- **`@utopia/pixi-kit`**: `createPixiApp(ctx)` (resolution/antialias by tier, ticker bound to `GameClock`), atlas loader, GSAP↔Pixi tween helpers, glow/bloom filters (tiered), particle emitter presets.
- **`@utopia/fx`**: palettes, GLSL chunks (simplex/curl noise, gradient skies, fresnel, dissolve, ripples), shared particle presets (success burst, soft sparkle, ember trail), color-blind-safe symbol set, and high-contrast material variants.

### 11.8 Developer experience

- `pnpm new-game <slug> --engine r3f|pixi` scaffolds manifest, logic state machine template, view, ghost, tests, and an asset license file.
- **Game Lab** route (`/lab`, dev only): mount any game in isolation with a settings panel (all accessibility toggles, quality tiers, levels, seeds), an FPS/memory overlay, event log, and "mount/destroy ×50" leak test button.
- Hot reload works inside the Game Lab without losing platform state.

---

## 12. Feed Preview Architecture

### 12.1 Constraints

- Mobile browsers cap simultaneous WebGL contexts (commonly ~8–16; iOS Safari evicts aggressively). Each context also costs memory and GPU time.
- The feed must scroll at 60 fps while a preview animates.
- Previews must look like the real game, because they *are* the real game rendering.

### 12.2 Three-tier preview strategy

| Tier | Where used | What renders |
|---|---|---|
| **Live preview** | Active (centered) card only, on devices with quality tier ≥ Medium and no reduced-motion/data-saver preference | The game's `preview` entry: its real renderer in attract mode, driven by the ghost player, with lighter settings (no postprocessing on Medium, capped DPR 1.5, 30–60 fps adaptive) |
| **Video loop** | Adjacent cards (N±1, N±2), plus the active card on Low tier | 6–8 s seamless loop captured from the live preview (MP4 H.264 + WebM VP9/AV1, 720×1280, ≤ 600 KB) with `muted playsinline loop` and `preload="metadata"` for N±2 |
| **Poster** | Everything else; reduced motion; save-data; offline without cache | AVIF/WebP still frame (≤ 60 KB) with blur-up placeholder (inline 16×28 base64) |

**Hard rule:** at most **one live WebGL context in the feed**, and never more than **two in total** (a feed preview during the transition + the game). The feed's live preview is destroyed once the game becomes interactive.

### 12.3 Active card handoff

1. Card snaps to center. Its video (if loaded) is already playing, so there's never a blank frame.
2. After **250 ms of dwell** (avoids thrash during fast scrolling), the runtime lazy-loads the preview chunk (usually prefetched) and mounts the live preview *under* the video.
3. When the live preview reports its first rendered frame, the video crossfades out over 200 ms.
4. On scroll away, the live preview is paused immediately and destroyed after 1.5 s if not re-centered (cheap return for small scroll wiggles). The video resumes instantly.

### 12.4 Play transition using the preview

1. Tap Play → the runtime calls `preview.captureFrame()` → keeps that bitmap as the **return poster**.
2. The card's preview element (live canvas or video) is animated (GSAP FLIP) to full screen.
3. The game instance mounts in the overlay container *behind* the expanding preview, with its assets prefetched.
4. When the game emits `ready`, the preview crossfades into the game's first frame (both share the same palette and camera framing by design, per the preview framing rule in §12.6), and the preview is destroyed.
5. On Exit, the return poster shows immediately in the card. The live preview remounts after the reverse transition completes.

### 12.5 Preview capture pipeline (CI)

- `tools/preview-capture` runs Playwright (Chromium, GPU enabled on a CI runner with a GPU or SwiftShader fallback) against `/lab/preview/:slug?seed=fixed&capture=1`.
- It records a 10 s window, auto-detects a seamless 6–8 s loop point (frame similarity), and encodes with ffmpeg to MP4 (H.264 High, CRF 28) + WebM, plus an AVIF poster at the most "representative" frame (a manual override frame index is set in the manifest).
- Output is content-hashed and uploaded to the CDN, with the manifest media fields updated at build.
- It runs when a game's `preview.ts`, `view/`, or `assets/` change.

### 12.6 Preview design rules (for every game)

- **Framing rule**: the preview uses the same camera and composition as the game's opening state, so the Play transition feels continuous.
- **Readability**: the core mechanic must be understandable with no sound and no text within the first 3 s of the loop.
- **Ghost player**: plays at "good but human" skill, occasionally making a mistake to show failure feedback.
- **Budget**: preview chunk ≤ 150 KB gz JS (excluding shared engine chunks) + ≤ 500 KB assets; must reach first frame ≤ 400 ms after mount on mid-tier.
- **No audio unless** the feed sound toggle is on.

### 12.7 Shared engine chunks

- `three` + R3F + drei subset → shared vendor chunk `engine-r3f` (loaded once, cached).
- `pixi.js` → `engine-pixi`.
- The first time a user reaches an R3F card, `engine-r3f` loads (~180–250 KB gz). Subsequent R3F games reuse it. The editorial feed order places a Pixi game and an R3F game in the first 3 cards so both engines are warmed early on good connections, and deferred on `saveData`/2G.

---

## 13. Loading, Lifecycle, and State

### 13.1 Lifecycle state machine (runtime)

```
         ┌─────────┐ prefetch  ┌───────────┐ tap Play ┌─────────┐ assets ok ┌───────┐
 (none)─►│  idle   │──────────►│ prefetched│─────────►│ loading │──────────►│ ready │
         └─────────┘           └───────────┘          └────┬────┘           └───┬───┘
                                                           │ error              │ start()
                                                      ┌────▼────┐          ┌────▼─────┐
                                                      │  error  │          │ tutorial │ (first time)
                                                      └─────────┘          └────┬─────┘
                                                                                ▼
                         restart()           ┌──────────┐  pause()  ┌────────┐
                   ┌────────────────────────►│ playing  │◄─────────►│ paused │
                   │                         └────┬─────┘  resume() └────────┘
                   │                              │ session_end
                   │                         ┌────▼─────┐
                   └─────────────────────────┤ results  │
                                             └────┬─────┘
                                                  │ exit (from ANY state)
                                             ┌────▼──────┐
                                             │ destroying│──► (none)
                                             └───────────┘
```

Implemented as an explicit typed state machine (XState or a small hand-rolled reducer). Invalid transitions throw in dev and are ignored and logged in prod.

### 13.2 Prefetch policy

| Trigger | What loads |
|---|---|
| App idle after first card rendered | Preview chunks for cards N+1, N+2; posters for N+1…N+4; video for N+1 |
| Card becomes active (250 ms dwell) | Its preview chunk (if not yet), preview assets |
| Card active for ≥ 800 ms *or* user hovers/touches Play | Its **game** chunk + `core` asset group (intent prefetch) |
| During gameplay | Nothing from the feed (bandwidth goes to the game's `deferred` asset group) |
| `navigator.connection.saveData` or effective type ≤ 3G | Posters only; no video; game chunk only on Play tap |

### 13.3 Module cache

- LRU cache of **2 game modules** (JS evaluated) and **4 preview modules** in memory. GPU resources are *never* cached across instances. They are recreated on mount, so memory stays predictable.
- Service worker caches chunks and assets on disk (§16.2).

### 13.4 Destroy contract (every game MUST)

- Cancel all rAF loops, timers, and tweens (GSAP contexts scoped per instance and reverted).
- Dispose all Three.js geometries/materials/textures/render targets (the R3F kit auto-disposes the scene graph; custom resources are registered via `ctx.signal`).
- Destroy Pixi application with `{ texture: true, textureSource: true }` for game-owned textures.
- Stop and disconnect all audio nodes. Music fades out over 200 ms max.
- Remove all DOM listeners (use `ctx.signal` with `addEventListener`).
- Resolve within 100 ms.
- **Verified in CI**: the Game Lab leak test runs mount→play 5 s→destroy ×50 in Playwright with `performance.memory` (Chromium) and WebGL resource counters. JS heap growth must be < 10 MB and the GPU texture count must return to baseline.

### 13.5 Pause/resume semantics

- `pause()` freezes game time (`GameClock` stops), suspends scheduled audio (music fades to 30%, SFX scheduling halts), and stops rendering (R3F `frameloop="never"`, Pixi ticker stop) after rendering one dimmed frame behind the pause menu.
- Timed tasks resume with the *remaining* time. Reaction-time trials interrupted by pause are **discarded** (not scored).
- `resume()` shows a 3-2-1 countdown (skippable in settings; replaced by a "Tap to resume" state for reduced motion).

### 13.6 Restart

- `restart()` resets logic state with a new seed, reuses loaded assets and the GPU scene (no reload), and must be interactive in ≤ 300 ms.

### 13.7 Error and context loss

- A per-game React error boundary around the overlay container catches mount errors. The user sees "This game hit a snag. [Try again] [Back to feed]," and the error is reported to Sentry with game id and version.
- On `webglcontextlost`: auto-pause, show "Restoring graphics…", attempt restore on `webglcontextrestored` (the R3F/Pixi kits rebuild). After 3 s, offer Restart/Exit.
- On repeated failures on a device, that game's preview drops to video/poster for the rest of the session.

---

## 14. Scoring, Difficulty, and Progress

### 14.1 Scoring philosophy

- Each game has its **own meaningful score** (e.g. sequence length, pairs found, perfect beats), shown with its own unit.
- **Personal bests** are tracked per game, per mode (normal/daily).
- There is **no cross-game composite score**, no "brain age," and no population percentile in V1. Comparison is only with your past self.
- Failure is soft: games use "lives," "misses," or time limits, but results always highlight progress ("Longest sequence yet!" or "3 more than last time").

### 14.2 Adaptive difficulty system (`@utopia/difficulty`)

**Target: the flow band.** Keep per-trial success around **70–85%** for skill games (lower bound 60% for "arcade" games with lives).

Provided helpers:

1. **Staircase** (default): configurable *n*-up/*m*-down (e.g. 2-up/1-down converges to ~70.7% success; 3-up/1-down to ~79%) over a game-defined parameter ladder (e.g. sequence length, ISI, distractor count).
2. **Continuous skill rating**: a simple Elo/Glicko-lite per game where the "opponent" is the level difficulty. It sets the starting level of the next session.
3. **Warm-up**: each session starts at `max(1, skillLevel − warmupOffset)` (default offset 2), ramping quickly over 2–3 trials to the estimated level.
4. **Relaxed timing multiplier**: global setting (1.0×, 1.5×, 2.0×, ∞ for "no time pressure" when the game supports it) scales all response windows *before* difficulty logic. It's recorded with sessions so bests are tracked separately per timing mode.

Each game defines a **difficulty ladder**: an ordered list of level definitions with 2–4 parameters varying together (documented per game in §23).

### 14.3 Progress model

- **Per game**: best score, highest level, skill rating, sessions played, total play time, last played, tutorial done, favorite.
- **Per ability**: practice minutes this week and all time, games practiced. It never presents an "ability score."
- **History**: last 50 sessions per game (summary only), shown as a sparkline on the game detail page and in Progress.

### 14.4 Daily Seed

- Each game offers a **Daily** mode: deterministic seed = hash(date UTC + game id). Everyone gets the same puzzle/sequence that day.
- There's a local-only daily best and no global leaderboards in V1. Daily Seeds are the variant cards after the feed loop.

---

## 15. Settings

### 15.1 Global settings

| Group | Setting | Values / default |
|---|---|---|
| **Visual** | Theme | System / Dark / Light |
| | High contrast | Off / On (games switch to high-contrast palettes, outlines, no grain/fog) |
| | Reduced motion | System / On / Off (defaults to the OS preference) |
| | Preview style (feed) | Live / Video / Still (auto by device & data) |
| | Text size | 100% / 125% / 150% / 200% (platform UI + HUD) |
| | Reading font | Default / Atkinson Hyperlegible / OpenDyslexic |
| | Color vision | Default / Protan / Deutan / Tritan / Monochrome-safe (swaps palettes; meaning never relies on color anyway) |
| | Flash & pulse intensity | Normal / Reduced / None |
| **Audio** | Master, Music, SFX, Voice | 0–100 (defaults 80/50/80/90) |
| | Feed preview sound | Off (default) / On |
| | Mono audio | Off / On |
| | Visual captions for sound cues | Off / On (on-screen icons/text for meaningful sounds) |
| **Haptics** | Vibration | On / Off (Android only; hidden on iOS) |
| **Gameplay** | Timing | Standard / Relaxed 1.5× / Relaxed 2× / No time pressure (where supported) |
| | Countdown on resume | On / Off |
| | Confirm before exit | On / Off |
| | Hide games needing fast reactions in feed | Off / On |
| | Hide audio-dependent games in feed | Off / On |
| | Left-handed layout | Off / On (mirrors on-screen control clusters) |
| **Wellbeing** | Break reminders | Off / 20 min / 40 min (default 40) |
| | Weekly practice goal | None (default) / 15 / 30 / 60 min |
| **Data** | Sync account | Sign in / Sign out |
| | Analytics | Essential only / Product analytics (default depends on region) |
| | Export my data | JSON download |
| | Delete my data | Local and cloud |

### 15.2 Per-game settings

Declared in the manifest and rendered by the platform in the pause menu, for example "Show sequence numbers" (Echo Garden), "Metronome click" (Tidal Beat), "Letter case" (Word Current), "Target shape set" (Glyphfield). Stored in `GameStorage`.

### 15.3 Effective settings

`EffectiveSettings = merge(defaults, global, perGame, deviceConstraints)`. They're pushed live to games via `setSettings()`, and games must apply changes without restarting (except where noted in the manifest).

---

## 16. Mobile and PWA

### 16.1 Mobile requirements

- Viewport: `width=device-width, initial-scale=1, viewport-fit=cover`. Use `dvh`/`svh` units and `env(safe-area-inset-*)` everywhere.
- Touch: `pointerdown`-driven interactions (no 300 ms click delay), `touch-action` set per surface, `overscroll-behavior: contain` on the feed and play overlay.
- iOS Safari specifics: unlock the audio context on the Play tap; handle `visibilitychange` and `pagehide`; recreate WebGL on context loss; avoid `backdrop-filter` on large animated areas (perf); cap DPR at 2 (3× screens → 2).
- Thermal/battery: the FPS governor drops the quality tier if frame time > 20 ms for 3 s. Previews cap at 30 fps when battery saver is detected (via `navigator.getBattery` where available) or after 60 s of continuous preview without interaction.
- Orientation: portrait-first. The overlay handles rotation by pausing, relayouting, and letting the user resume.

### 16.2 PWA

- **Manifest**: name, short_name "Utopia", icons (maskable 192/512), `display: standalone`, `orientation: any`, theme/background colors, screenshots for install UI, and shortcuts ("Continue last game," "Library").
- **Service worker (Workbox)**:
  - *Precache*: app shell, fonts, UI sounds, feed manifest, posters.
  - *Runtime cache, stale-while-revalidate*: catalog config.
  - *Runtime cache, cache-first with hashed URLs*: game chunks, engine chunks, assets, preview videos (LRU, max ~250 MB, quota-aware).
  - A game is **offline-playable once it has been played** (its chunk + core assets are cached). Library shows an "Available offline" badge.
- Offline feed: cards for games not cached show a poster with "Connect to play" and are moved to the end of the feed.
- **Install prompt**: non-intrusive. Shown only after the 3rd session and 2+ games played, as a dismissible utility card, never a modal.
- Updates: new SW waits, and a toast "Update ready — refresh" appears between games (never mid-game).

### 16.3 Sync (optional account)

- **Local-first**: all progress writes to IndexedDB first.
- When signed in, a sync worker batches `play_sessions` and settings deltas to Supabase every 30 s and on `pagehide` (via `fetch keepalive`/`sendBeacon`). Conflicts resolve with last-write-wins for settings and a union for sessions (immutable records keyed by client-generated UUIDv7).
- Sign-in methods: email magic link, Apple, Google. Anonymous local data merges into the account on first sign-in.

---

## 17. Performance Requirements

### 17.1 Reference devices

| Tier | Devices (minimum test set) |
|---|---|
| **High** | iPhone 15/16, Pixel 8+, Galaxy S23+, M-series Mac, desktop with discrete/modern iGPU |
| **Medium (primary target)** | iPhone 12/13, Pixel 6a/7a, Galaxy A54/A55, 2020+ Intel iGPU laptop |
| **Low (must work, reduced visuals)** | iPhone SE (2nd gen), Galaxy A14/A15, Moto G-series, Chromebook (Celeron-class) |

### 17.2 Budgets

| Metric | Target |
|---|---|
| App shell JS (initial, gz) | ≤ 180 KB (excluding engine chunks) |
| LCP (first card poster) | ≤ 2.5 s on 4G Medium tier |
| INP (platform UI) | ≤ 150 ms p75 |
| CLS | ≤ 0.05 |
| Feed scroll | 60 fps with active live preview on Medium (dropped frames < 5%) |
| Live preview first frame after mount | ≤ 400 ms Medium |
| Time-to-interactive after Play (prefetched) | ≤ 1.0 s Medium, ≤ 1.5 s Low |
| Time-to-interactive after Play (cold, 4G) | ≤ 3.0 s |
| Exit → feed interactive | ≤ 350 ms |
| Restart → interactive | ≤ 300 ms |
| Gameplay frame rate | ≥ 55 fps p50 and ≥ 45 fps p10 on Medium; ≥ 30 fps p10 on Low |
| Input-to-visual feedback | ≤ 50 ms (next frame) |
| Per-game JS (gz, excl. shared engine) | ≤ 250 KB |
| Per-game `core` assets | ≤ 1.5 MB (mobile), `deferred` ≤ 3 MB |
| Preview video | ≤ 600 KB each; poster ≤ 60 KB |
| JS heap during play (mobile) | ≤ 150 MB; GPU memory ≤ 200 MB estimated |
| Draw calls per frame (Medium) | ≤ 100 (use instancing/batching) |
| Triangles per frame (Medium) | ≤ 150k |
| Texture budget per game (Medium) | ≤ 64 MB GPU (KTX2 compressed) |

### 17.3 Quality tiers

| Setting | Low | Medium | High |
|---|---|---|---|
| Max DPR | 1.0–1.25 | 1.5 | 2.0 |
| Postprocessing | None (bloom baked into sprites/emissive fakery) | Bloom (half-res) + vignette | Bloom + SMAA + grain + (optional) DOF |
| Shadows | Baked/blob | Baked + 1 dynamic (512) | 1–2 dynamic (1024) |
| Particles scale | 0.3 | 0.6 | 1.0 |
| MSAA | Off | Off (SMAA/FXAA) | On where cheap |
| Live feed preview | Off (video) | On (30–60 fps) | On (60 fps) |

- The initial tier comes from `detect-gpu` plus a device memory hint. The **runtime FPS governor** steps down after sustained frame time > 20 ms (3 s window) and steps up cautiously after 10 s under 12 ms (max 1 step up per session).
- Users can force a tier ("Graphics: Auto / Battery saver / High").

### 17.4 Performance engineering rules

- Instancing for repeated meshes; texture atlases for sprites; no per-frame allocations in hot loops (object pools); no React re-renders inside the frame loop (use refs and `useFrame` mutations).
- Shaders are compiled during loading (`renderer.compile` / Pixi prepare) to avoid first-interaction hitches.
- Audio buffers are decoded during loading, not on first play.
- CI performance tests: Playwright with CPU throttling (4×) runs each game's ghost for 30 s and asserts frame-time p90 on the CI GPU profile. Real-device testing happens weekly via BrowserStack/LambdaTest and an in-house device shelf (≥ 1 device per tier per OS).
- Telemetry: sampled (10%) in-game FPS histograms, load timings, and tier changes are sent to PostHog to catch regressions in the field.

---

## 18. Asset and Licensing Strategy

### 18.1 Principles

1. **Prefer procedural and in-house** (shaders, generated geometry, synthesized audio). These are the lightest, most cohesive, and carry zero license risk.
2. **Then CC0 / public domain** sources.
3. **Then permissive licenses** that allow commercial use and modification (CC-BY 4.0 with attribution, MIT, OFL for fonts).
4. **Never** use: CC-BY-NC, CC-BY-ND, "free for personal use," editorial-only, unclear/unlicensed assets, AI-generated assets without clear rights, or assets ripped from other games.
5. **Commission** hero assets where the identity matters (app icon, logo, 3–5 signature models, music beds) with work-for-hire contracts granting full rights.

### 18.2 Approved sources (V1)

| Type | Sources |
|---|---|
| 3D models | Kenney (CC0), Quaternius (CC0), Poly Pizza (filter CC0/CC-BY), KayKit (CC0), Poly Haven models (CC0) |
| HDRIs & textures | Poly Haven (CC0), ambientCG (CC0) |
| 2D sprites/UI | Kenney (CC0), custom illustration |
| Icons | Lucide (ISC), custom |
| Fonts | Google Fonts OFL: Fraunces, Manrope, Atkinson Hyperlegible; OpenDyslexic (OFL) |
| SFX | Procedural Web Audio synthesis first; Freesound (CC0 only), Kenney audio packs (CC0), Sonniss GDC bundles (royalty-free license—verify terms per bundle) |
| Music | Commissioned ambient beds (work-for-hire), or CC0 tracks; procedural generative ambience for calm games |
| Voice (language games) | Recorded voice talent (work-for-hire, 2 voices: female/male, neutral accent) for word/phoneme lists; **not** runtime TTS for core phoneme content (quality and consistency) |
| Word lists | Public-domain or permissively licensed frequency lists (e.g. SUBTLEX-derived lists where license allows; otherwise in-house curated lists), reviewed for age-appropriateness |

### 18.3 Asset registry and CI enforcement

Every asset directory contains `LICENSES.json`:

```json
[{
  "file": "models/lantern.glb",
  "source": "https://quaternius.com/…",
  "author": "Quaternius",
  "license": "CC0-1.0",
  "attributionRequired": false,
  "modified": true,
  "addedBy": "tech-art@utopia",
  "addedOn": "2026-10-12"
}]
```

- `tools/license-check` fails CI if any file under `games/*/assets` or `packages/*/assets` lacks an entry, or uses a license outside the allowlist (`CC0-1.0`, `CC-BY-4.0`, `MIT`, `ISC`, `OFL-1.1`, `Apache-2.0`, `Proprietary-Owned`).
- The Credits page and each game's info sheet are **generated** from the registry, so attribution is always correct.

### 18.4 Asset pipeline

- `gltf-transform`: dedupe, prune, weld, quantize, meshopt compress, and resize textures to power-of-two.
- `toktx`/`basisu`: KTX2 (UASTC for normals/detail, ETC1S for color).
- Sprite atlases: free-tex-packer CLI → Pixi spritesheet JSON + AVIF/WebP/PNG fallback.
- Audio: loudness normalization (-16 LUFS for music, -14 for SFX peaks) with ffmpeg → Opus/WebM + AAC/m4a.
- Asset groups per game: `preview`, `core` (needed to start), `deferred` (later levels, music variants).

---

## 19. Accessibility Requirements

### 19.1 Standards

- **Platform UI**: WCAG 2.2 Level AA, including 2.5.8 Target Size (we exceed it with a 44×44 px minimum and 56 px primary actions), focus visible, keyboard operability, reflow at 320 CSS px, and 200% text zoom.
- **Games**: follow the **Game Accessibility Guidelines** (basic plus selected intermediate) and the **Xbox Accessibility Guidelines** where relevant, applying WCAG 2.3.1 (no content flashing > 3 times/second) as a hard rule.

### 19.2 Platform accessibility features

- Full keyboard navigation of the feed, library, menus, and results. Visible focus rings (3 px, high contrast).
- Screen reader support for all platform UI. Feed cards announce "Game 3 of 20: Lantern Lake. Spatial memory. Remember where the lanterns glowed. About 3 minutes. Personal best 7. Play button."
- Live preview canvases are `aria-hidden`. The card's text description is the accessible content.
- An ARIA live region (via `ctx.a11y.announce`) for game state announcements (level up, round result, game over).
- Every game's detail page lists its accessibility profile (manifest `accessibility` block) in plain language.
- Respect `prefers-reduced-motion`, `prefers-contrast`, `prefers-color-scheme`, and `prefers-reduced-transparency` (disables glass blur).

### 19.3 Accessibility Baseline (mandatory for every game)

| # | Requirement |
|---|---|
| A1 | **Color independence**: no information conveyed by color alone. Use shape, icon, pattern, position, label, or sound as well. |
| A2 | **High-contrast mode**: a high-contrast palette with ≥ 3:1 contrast for gameplay objects vs. background (≥ 4.5:1 for text), outlines on interactive objects, and no fog/grain. |
| A3 | **Reduced motion**: no camera shake, no parallax, no screen-wide flashes. Ambient motion is reduced or stopped, and essential motion is kept but slower where timing isn't the mechanic. |
| A4 | **Photosensitivity safe**: no flashing > 3 Hz; large bright flashes limited; "Flash & pulse intensity" setting respected. |
| A5 | **Touch targets** ≥ 44×44 CSS px (game objects that are tap targets have hit areas ≥ 48 px even if visually smaller). |
| A6 | **Keyboard playable** end-to-end, with a documented key map shown in the info sheet. |
| A7 | **Audio**: independent volume buses. Game fully playable with sound off unless flagged `requiresAudio`. Every meaningful sound has a visual equivalent. If `requiresAudio`, captions/visual cues are offered where it doesn't defeat the mechanic, and the game is tagged clearly. |
| A8 | **Timing**: honors the relaxed timing multiplier. Games without inherent time mechanics offer "no time pressure." |
| A9 | **Text**: minimal, ≥ 16 px equivalent at 100%, scales with the text size setting, uses the reading font setting. |
| A10 | **Pause anywhere**, with no penalty and no time running while paused. |
| A11 | **Clear failure**: errors are shown with shape/position/motion + sound + haptic, not just red. |
| A12 | **Cognitive load**: one new concept per tutorial step, consistent control mapping across games (primary action = tap / Space). |
| A13 | **No hidden time limits** on menus or tutorials. |

### 19.4 Accessibility QA

- An automated axe-core pass on all platform routes in CI.
- A manual checklist per game (A1–A13) signed off by the accessibility advisor.
- Playtests with at least 5 disabled players (low vision, colorblind, motor impairment, dyslexia, deaf/hard of hearing) before V1 launch, with findings triaged as launch blockers where they affect A1–A13.

---

## 20. Safety, Claims, and Wellbeing

### 20.1 Claims policy

Utopia games are **designed around** cognitive abilities. They do not diagnose, treat, cure, or prevent any condition, and they are not medical devices. In the US, UK, and EU, implying clinical benefit could also trigger medical-device and consumer-protection regulation (the FTC acted against Lumosity in 2016 over exactly these claims).

| ✅ Allowed language | ❌ Not allowed |
|---|---|
| "Designed around working memory" | "Improves your memory" |
| "Practice sustained attention" | "Treats ADHD" / "Clinically proven" |
| "Inspired by the Corsi block-tapping task used in memory research" | "Increases IQ" / "Makes you smarter" |
| "A calm, breath-paced focus game" | "Reduces anxiety" / "Therapy" |
| "Your personal best" | "Brain age" / "You're in the top 10% of people" |
| "Many players find it relaxing" | "Prevents dementia / cognitive decline" |

- Each game has a **Science note** in its info sheet: the research paradigm it's inspired by (e.g. "Based on the n-back paradigm"), with 1–2 references and a clear line: *"Playing games like this is practice, not treatment. Research on whether practice transfers to everyday skills is mixed."*
- A scientific advisor (cognitive psychologist) reviews all ability mappings and copy. The review is part of Definition of Done.

### 20.2 Wellbeing and anti-dark-pattern commitments

- No ads, no loot boxes, no currencies, no energy timers.
- **No streak punishments.** We may show "Days practiced this week" but never "You'll lose your streak!"
- **Break reminders**: after N minutes of continuous use (default 40), a gentle utility card appears in the feed ("You've been playing a while. Stretch, blink, breathe?"), with an option to open Still Water. It never interrupts gameplay.
- **Finite feed**: the feed ends after 20 cards with an explicit end card before any repetition.
- Notifications: none in V1 (no push).
- Preview audio off by default. No autoplay of games.

### 20.3 Privacy and data protection

- Data minimization: anonymous play collects no PII. Account data is limited to email/OAuth id plus a display name (optional).
- Gameplay data is stored as session summaries and aggregated trial stats. Raw per-trial logs stay **on-device only** in V1 (used for local charts), never uploaded unless a future opt-in research mode exists (V2, with consent).
- GDPR/UK GDPR/CCPA: privacy policy, data export, deletion, and DPA with processors (Supabase, PostHog, Sentry). EU data residency where possible.
- Analytics: cookieless by default, IP anonymized, no cross-site tracking, no third-party ad pixels.
- Under-13: no account creation; local-only.

### 20.4 Content safety

- No user-generated content in V1.
- Word lists for language games are reviewed for offensive or sensitive terms (automated blocklist + human review).
- Imagery avoids violence. Failure states avoid "death" framing (things fade, drift, dim, or scatter instead).

---

## 21. Analytics and Metrics

### 21.1 North star metric

**Meaningful Play Sessions per Weekly Active User (MPS/WAU).**
A *meaningful play session* is a game session where the player completed at least one full round (or 60 s of active play for continuous games) and reached the results screen or exited after natural progress.

Why this metric: it rewards actual playing and completion, not scrolling or idle time. A user who plays three satisfying games in five minutes counts as a success.

### 21.2 Metric tree

| Category | Metric | Definition | V1 target |
|---|---|---|---|
| **Discovery** | Preview→Play rate | Card impressions (≥ 1 s dwell) that led to Play | ≥ 35% |
| | Time to first play | App open → first gameplay input | median ≤ 8 s (returning), ≤ 20 s (new) |
| | Feed depth before first play | Cards viewed before first Play | median ≤ 3 |
| | Scroll-without-play ratio | Sessions with ≥ 10 cards viewed and 0 plays (a mindless-scrolling signal; we want this **low**) | ≤ 15% |
| **Play quality** | Round completion rate | Rounds started that reached round_end | ≥ 80% |
| | Early exit rate | Exits within 10 s of play start (tutorial confusion / disinterest) | ≤ 20% per game |
| | Replay rate | Results screens followed by "Play again" | ≥ 45% |
| | Tutorial completion | First plays that complete the micro-tutorial | ≥ 85% |
| | Difficulty fit | % rounds with trial success in the target band (per game) | ≥ 60% of rounds |
| **Breadth** | Games tried per user (first 7 days) | Distinct games with ≥ 1 meaningful session | median ≥ 5 |
| | Ability coverage | Distinct ability categories practiced per WAU | median ≥ 3 |
| **Retention** | D1 / D7 / D30 return | Users returning with ≥ 1 meaningful session | D7 ≥ 20%, D30 ≥ 10% |
| **Wellbeing guardrails** | Long session share | Sessions > 60 min continuous (watched, **not** optimized; if rising, strengthen break design) | monitor |
| | Break reminder acceptance | % reminder cards followed by a pause or Still Water | monitor |
| **Accessibility** | Setting adoption | % users with any accessibility setting enabled | monitor (reveals needs) |
| | Per-setting completion parity | Completion rate with setting X on vs. off | within 10 points |
| **Technical** | Crash-free play sessions | Sessions without fatal errors | ≥ 99.5% |
| | Load TTI p75 per game | Play tap → interactive | ≤ 1.5 s |
| | FPS p10 per game per tier | From sampled telemetry | per §17 |
| | Context-loss rate | Per 1,000 sessions | ≤ 2 |

**Explicit anti-goals:** we will not set targets for total time-on-app, cards scrolled, or sessions per day. Features are not approved on the basis of increasing those metrics alone.

### 21.3 Event schema (typed in `@utopia/analytics`)

| Event | Properties |
|---|---|
| `app_open` | `is_new_user`, `is_pwa`, `tier`, `connection`, `reduced_motion`, `locale` |
| `feed_card_impression` | `game_id`, `position`, `cycle`, `variant (normal/daily)`, `preview_mode (live/video/poster)`, `dwell_ms` (sent on leave) |
| `feed_card_action` | `game_id`, `action (play/info/favorite/sound)` |
| `game_load` | `game_id`, `version`, `prefetched`, `tti_ms`, `from (feed/library/deeplink)` |
| `game_tutorial` | `game_id`, `completed`, `skipped`, `duration_ms` |
| `game_round_end` | `game_id`, `round`, `level`, `score`, `accuracy`, `duration_ms`, `timing_mode` |
| `game_session_end` | `game_id`, `score`, `level_reached`, `duration_ms`, `completed`, `is_pb`, `rounds` |
| `game_exit` | `game_id`, `state (loading/playing/paused/results)`, `elapsed_ms` |
| `game_action` | `game_id`, `action (restart/play_again/next_game/pause)` |
| `game_perf` (sampled 10%) | `game_id`, `tier`, `fps_p50`, `fps_p10`, `tier_changes`, `heap_mb` |
| `setting_changed` | `key`, `value` (enumerated values only, no free text) |
| `wellbeing_reminder` | `shown`, `action (dismiss/break/still-water)` |
| `error` | `game_id?`, `kind`, `fatal` (details go to Sentry) |

- Events are batched and sent with `sendBeacon`. Each carries a `session_id` (app session) and anonymous `device_id`, plus `user_id` only if signed in.
- Per-trial data is **never** sent to analytics.
- Analytics respects the consent setting. With "Essential only," only technical error/perf data is sent, with no identifiers.

### 21.4 Dashboards (PostHog)

1. Discovery funnel: impression → play → tutorial → round end → play again.
2. Per-game health: early exit rate, replay rate, completion, difficulty fit, TTI, FPS p10.
3. Retention cohorts by first-played game.
4. Accessibility adoption and parity.
5. Wellbeing guardrails.

---

## 22. Data Models

### 22.1 Entity overview

```
profiles ─┬─ user_settings (1:1)
          ├─ game_progress (1:N, per game)
          ├─ play_sessions (1:N; round summaries inline as JSONB)
          ├─ favorites (1:N)
          └─ daily_results (1:N)

games (catalog) ─── game_versions (1:N)
feed_config (versioned singleton)
feature flags → PostHog

V2: contributors, submissions, submission_versions, reviews, review_checklists (§27)
```

### 22.2 Postgres schema (Supabase)

```sql
-- USERS (auth.users is managed by Supabase Auth)
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text check (char_length(display_name) <= 40),
  age_gate_passed boolean not null default false,   -- confirmed 13+
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.user_settings (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,   -- validated by a shared zod schema
  schema_ver  int not null default 1,
  updated_at  timestamptz not null default now()
);

-- CATALOG
create table public.games (
  id                  text primary key,             -- 'echo-garden'
  title               text not null,
  primary_ability     text not null,
  secondary_abilities text[] not null default '{}',
  engine              text not null check (engine in ('r3f','pixi','canvas2d','dom')),
  energy              text not null check (energy in ('calm','focused','active')),
  status              text not null default 'live'
                      check (status in ('draft','beta','live','disabled')),
  current_version     text not null,
  created_at          timestamptz not null default now()
);

create table public.game_versions (
  game_id     text references public.games(id),
  version     text not null,
  manifest    jsonb not null,                       -- serializable manifest snapshot
  released_at timestamptz not null default now(),
  primary key (game_id, version)
);

create table public.feed_config (
  id          int primary key default 1,
  version     int not null,
  base_order  text[] not null,                      -- game ids
  rules       jsonb not null,                       -- personalization knobs
  updated_at  timestamptz not null default now()
);

-- PROGRESS
create table public.game_progress (
  user_id            uuid references public.profiles(id) on delete cascade,
  game_id            text references public.games(id),
  best_score         int not null default 0,
  best_score_relaxed int not null default 0,        -- relaxed timing tracked separately
  best_daily_streak  int not null default 0,
  highest_level      int not null default 0,
  skill_rating       real,                          -- Glicko-lite mu
  skill_rd           real,                          -- rating deviation
  sessions_count     int not null default 0,
  total_play_ms      bigint not null default 0,
  tutorial_done      boolean not null default false,
  game_storage       jsonb not null default '{}',   -- per-game KV (settings, unlocks)
  last_played_at     timestamptz,
  updated_at         timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table public.play_sessions (
  id            uuid primary key,                   -- client-generated UUIDv7 (idempotent sync)
  user_id       uuid not null references public.profiles(id) on delete cascade,
  game_id       text not null references public.games(id),
  game_version  text not null,
  mode          text not null check (mode in ('normal','daily','tutorial')),
  seed          bigint not null,
  started_at    timestamptz not null,
  duration_ms   int not null,
  score         int not null,
  level_start   int not null,
  level_reached int not null,
  completed     boolean not null,
  timing_mode   text not null default 'standard',
  stats         jsonb not null default '{}',        -- game-specific aggregates
  rounds        jsonb not null default '[]',        -- [{round, level, score, accuracy, ms}]
  client_meta   jsonb not null default '{}',        -- tier, input type (no PII)
  created_at    timestamptz not null default now()
);
create index on public.play_sessions (user_id, game_id, started_at desc);

create table public.favorites (
  user_id    uuid references public.profiles(id) on delete cascade,
  game_id    text references public.games(id),
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);

create table public.daily_results (
  user_id    uuid references public.profiles(id) on delete cascade,
  game_id    text references public.games(id),
  day        date not null,
  best_score int not null,
  primary key (user_id, game_id, day)
);

-- RLS: every user-owned table gets policies "user_id = auth.uid()" (profiles: id = auth.uid())
-- for select/insert/update/delete. Catalog tables: public read, service-role write.
-- play_sessions: insert/select only (immutable once written).
```

### 22.3 Local (IndexedDB) stores

| Store | Key | Contents |
|---|---|---|
| `settings` | `'global'` | Global settings object |
| `progress` | `gameId` | Same shape as `game_progress` |
| `sessions` | `id` | `play_sessions` records + `synced: boolean` |
| `trials` | `[sessionId, idx]` | Raw trial logs (on-device only; capped at the last 50 sessions per game) |
| `feed` | `'state'` | Last feed order, index, cycle (a session-scoped copy lives in sessionStorage) |
| `meta` | various | device_id, first_seen, install state, schema version |

The schema is versioned with Dexie migrations. Sync is described in §16.3.

### 22.4 Ability categories (Progress rings)

| Ring | Abilities | Games |
|---|---|---|
| Memory | working-memory, spatial-memory | Echo Garden, Starback, Lantern Lake |
| Attention | selective-attention, sustained-attention, divided-attention | Glyphfield, Night Harbor, Shoal |
| Perception | visual-processing, spatial-reasoning | Glimpse, Silhouette |
| Reasoning & Planning | pattern-recognition, planning | Loom, Stonepath, Lumen |
| Language | phonological-awareness, reading-fluency | Rhyme Tide, Word Current |
| Flexibility & Control | cognitive-flexibility, inhibition | Prism Sort, Firefly Night, Upstream |
| Timing & Coordination | reaction-timing, visuomotor-coordination, rhythm-timing | Zenith, Orbit Keeper, Tidal Beat |
| Calm | calm-attention | Still Water |

---

## 23. The V1 Game Catalog (20 Games)

### 23.1 Game Quality Bar (every game must meet all of these)

1. **5-second clarity**: a first-time player understands the goal from the preview plus the micro-tutorial.
2. **One-minute hook**: the first round is fun in under 60 s, and the player wants a second round.
3. **Distinct mechanic**: no two games share a core interaction loop.
4. **Adaptive**: difficulty ladder with a staircase or skill rating; target success band met in ghost simulations and playtests.
5. **Beautiful at rest**: a random paused frame is screenshot-worthy.
6. **Juicy feedback**: every input has an immediate visual, audio, and (optional) haptic response within one frame.
7. **Accessibility Baseline A1–A13** passed (§19.3).
8. **Performance budgets** met on the Medium tier (§17).
9. **Honest copy**: ability mapping and science note approved by the advisor.
10. **Clean lifecycle**: passes the leak test and pause/resume/restart/exit test suite.

### 23.2 Catalog overview

| # | Game | Primary ability | Core mechanic | Engine | Energy | Session |
|---|---|---|---|---|---|---|
| 1 | **Echo Garden** | Working memory | Repeat growing melodic sequences sung by glowing flowers | R3F | Focused | 2–4 min |
| 2 | **Starback** | Working memory (updating) | N-back on appearing constellations | R3F | Focused | 2–3 min |
| 3 | **Lantern Lake** | Spatial memory | Recall where lanterns lit on a dark lake (Corsi-style) | R3F | Calm | 2–4 min |
| 4 | **Glyphfield** | Selective attention | Find the one target glyph in a living field of look-alikes | Pixi | Focused | 2–3 min |
| 5 | **Night Harbor** | Sustained attention | Lighthouse vigil: flag rare signal ships, ignore the rest | Pixi | Calm | 3–4 min |
| 6 | **Shoal** | Divided attention / tracking | Track tagged fish as the school swirls, then identify them | R3F | Focused | 2–3 min |
| 7 | **Glimpse** | Visual processing speed | Identify center and peripheral shapes from a brief flash | Pixi | Active | 2–3 min |
| 8 | **Silhouette** | Spatial reasoning | Rotate a floating sculpture to match a shadow cast on the wall | R3F | Calm | 3–5 min |
| 9 | **Loom** | Pattern recognition | Complete woven tile patterns by inferring the hidden rule | Pixi | Calm | 3–5 min |
| 10 | **Rhyme Tide** | Phonological awareness | Catch syllables/rhymes riding the waves into the right order | Pixi + voice | Focused | 2–4 min |
| 11 | **Word Current** | Reading fluency | Sort real words from pseudo-words flowing down a river | Pixi | Active | 2–3 min |
| 12 | **Prism Sort** | Cognitive flexibility | Sort crystals by a rule that silently changes | R3F | Focused | 2–4 min |
| 13 | **Firefly Night** | Inhibition (go/no-go + stop) | Catch fireflies, spare moths, freeze when the wind chime sounds | Pixi | Active | 2–3 min |
| 14 | **Upstream** | Interference control | Swipe the direction of the lead fish, ignoring its schoolmates | Pixi | Active | 2–3 min |
| 15 | **Zenith** | Reaction and anticipation timing | Stop orbiting comets exactly at the gate | R3F | Active | 1–3 min |
| 16 | **Orbit Keeper** | Visuomotor coordination | Hold-to-steer a moon through rings with one touch | Pixi | Active | 1–3 min |
| 17 | **Stonepath** | Planning | Rearrange glowing stones on pillars in minimal moves (Tower of London) | R3F | Calm | 3–5 min |
| 18 | **Lumen** | Planning / spatial problem solving | Rotate mirrors to route light through a floating temple | R3F | Calm | 3–6 min |
| 19 | **Tidal Beat** | Rhythm and timing | Tap in time with the sea, then keep the beat when the music drops out | Pixi + Tone.js | Focused | 2–3 min |
| 20 | **Still Water** | Calm attention | Breath-paced focus: keep ripples steady and notice drifting thoughts | R3F | Calm | 2–5 min |

Engine split: 10 R3F, 10 Pixi. Energy mix: 7 calm, 7 focused, 6 active.

### 23.3 Shared conventions across games

- **Primary action** = tap (touch) / click / `Space` or `Enter`. **Directional** = swipe / arrow keys / WASD. **Drag** = drag / arrow keys + `Space` to select and place.
- **Lives**: shown as 3 soft glowing orbs (not hearts), where used.
- **Round structure**: games are built from rounds of 30–90 s. A session = 3–5 rounds or until lives run out.
- **Visual error** = shape-change + position shake (disabled in reduced motion, replaced with outline pulse) + low "thunk" + haptic. **Visual success** = bloom + particle burst (scaled by tier) + tone in the game's scale.
- **Relaxed timing** multiplies all response windows/presentation rates. *No time pressure* is available wherever timing isn't the ability being trained.

---

### Game 1 — Echo Garden

1. **Name:** Echo Garden
2. **Core concept:** A moonlit garden of bioluminescent flowers. Each flower sings a note when it blooms. The garden sings a melody, and you sing it back by tapping the flowers in order. The garden grows with each correct song.
3. **Target ability:** Working memory (sequence span, visuospatial + auditory). *Science note: inspired by Simon-style serial recall and span tasks.*
4. **Gameplay loop:**
   1. The garden plays a sequence: flowers bloom one at a time, each with its note and light pulse.
   2. The player taps the flowers in the same order. Each tap blooms that flower.
   3. Correct full sequence → new sprout grows, sequence length +1 (per staircase), round score added.
   4. Mistake → the mistaken flower wilts briefly, the correct flower glows to show the answer, and one life (petal orb) is lost. The same length replays with a new sequence.
   5. At higher levels, **Reverse Bloom** trials appear (a moon icon plus a flipped-arrow glyph cue): repeat the sequence backwards.
   6. Session ends after 3 lives lost or 12 trials.
5. **Controls:** *Mobile:* tap flowers (hit radius ≥ 56 px). *Desktop:* click, or number keys `1–9` mapped to flowers (flowers show small numerals when "Show key hints" is on). `R` replays the sequence once per trial (costs score multiplier).
6. **Difficulty progression:** 2-up/1-down staircase on sequence length (start 3, up to 12+). Secondary parameters: flower count (4 → 9), presentation rate (800 ms → 450 ms per item), reverse trials (from level 6), and "wind" (flowers gently swap positions between trials at level 10+ so position-only chunking stops working).
7. **Scoring/failure:** points = length × 10 × multiplier (×1.5 reverse, ×0.5 if replayed). 3 lives. Stats: longest sequence, longest reverse, accuracy.
8. **Visual/art direction:** Deep indigo night, glowing flowers with translucent petals (fresnel shader, emissive vein textures), fireflies, soft ground fog, moon glow. Each flower has a unique **shape** (tulip, lotus, bell, star, etc.) *and* color, so they never depend on color. Bloom animation uses vertex-shader petal opening.
9. **Engine/tools:** R3F, drei (`Instances`, `Float`), custom petal shader, postprocessing bloom, GSAP timelines for sequence playback, `@utopia/audio` synth voices (soft marimba/kalimba FM patch). Flower meshes are procedural (lathe geometry plus petal instancing).
10. **Sound/feedback:** Each flower is tied to a note in C major pentatonic (sequences always sound musical). A correct sequence triggers a harmonized chord and chime cascade. A mistake plays a gentle detuned low note. Ambient crickets and wind sit under a soft pad. Haptic tick on each tap.
11. **Accessibility:** Shape-coded flowers. Optional numerals on flowers. Playable **with sound off** (light and bloom motion carry the sequence) or **audio-only** (distinct notes; "Audio mode" uses spatial panning left→right per flower position). Relaxed timing slows presentation. No time limit on response by default. Reduced motion: no swaying, bloom as scale plus brightness only.
12. **Session length:** 2–4 minutes.
13. **Feed preview:** Camera slowly orbits the garden. The ghost plays a 5-note sequence, "taps" it back (with a subtle touch ripple showing the tap), the garden sprouts a new flower with a sparkle burst, and the loop resets on a moon-glow fade.
14. **Fun and replayability:** The melody-making is inherently satisfying, since the sequences sound like tiny songs. The visible garden growth gives a sense of building something. Reverse Bloom and wind add fresh twists at mastery levels. The Daily Seed "Song of the Day" is the same melody for everyone.

---

### Game 2 — Starback

1. **Name:** Starback
2. **Core concept:** Stars ignite one by one across a dark sky dome. Each star appears in one of 8 constellation positions. Tap **"Match"** when the current star appears in the same position as the one *N steps back*. Correct matches draw glowing lines, slowly revealing a constellation artwork.
3. **Target ability:** Working memory updating. *Science note: based on the spatial n-back paradigm.*
4. **Gameplay loop:**
   1. A round presents ~20 + N stars at a steady rhythm (one every 2.5 s at start).
   2. For each star, the player taps Match if its position matches the star N back. Otherwise they do nothing.
   3. Hits connect stars into the round's hidden constellation (e.g. a whale, a fox). False alarms create a brief fading cloud.
   4. End of round: the completed constellation animates to life (the whale swims across the sky) and accuracy is shown.
   5. N adjusts for the next round based on accuracy.
5. **Controls:** *Mobile:* large Match button at bottom center (full-width 72 px pill), or tap anywhere in the lower half. *Desktop:* `Space`/`M` or click.
6. **Difficulty progression:** N from 1 → 2 → 3 → 4+ adjusts between rounds (≥ 85% accuracy → N+1; < 60% → N−1). Within an N, the interval shortens (2.5 s → 1.8 s) and **lure** density increases (stars matching N±1 back). Advanced **Dual Mode** (unlock at N=3): each star also has a tone, and there are two buttons, Position and Tone.
7. **Scoring/failure:** Signal-detection scoring: hits +10×N, false alarms −5, misses 0. Accuracy is (hits + correct rejections)/total. There are no lives. A session is 3 rounds. Stats: highest N, accuracy, constellations collected.
8. **Visual/art direction:** Deep-space gradient dome with a painterly nebula shader (fbm noise), twinkling star field (instanced points), ignition flare for each new star, and gold filament lines for constellations. Constellation artworks are collectible and shown in a small "sky atlas" on the results screen.
9. **Engine/tools:** R3F, instanced points with a custom shader, `Line2` from three-stdlib for fat lines, bloom, and GSAP for constellation reveal. Constellation data comes from in-house SVG paths → point sets.
10. **Sound/feedback:** Each position has a soft bell pitch (it reinforces position and is optional). A hit plays a harp gliss and line "zing." A false alarm plays a muffled tick. A round-complete constellation gets a unique short motif.
11. **Accessibility:** Positions are also labeled by **distinct star shapes** in high-contrast mode (8 shapes) and have optional position numbers. Relaxed timing lengthens the interval. The single-button input works for switch users. With sound off, the game is fully playable (the position is visual). Dual Mode is flagged `requiresAudio` and is optional.
12. **Session length:** 2–3 minutes.
13. **Feed preview:** Stars ignite in rhythm. The ghost hits two matches in a row, gold lines connect, and the partial constellation of a fox shimmers then leaps across the sky before the loop resets.
14. **Fun and replayability:** The collecting motivation (a 24-constellation sky atlas, with the round's constellation chosen by seed), meditative rhythm, and a clear sense of mastery as N climbs. It's a hard task made to feel like stargazing.

---

### Game 3 — Lantern Lake

1. **Name:** Lantern Lake
2. **Core concept:** Paper lanterns float on a still, dark lake. A few of them light up one by one, then go dark. Relight them in the same order and watch them lift into the sky.
3. **Target ability:** Spatial memory (visuospatial sequence span). *Science note: inspired by the Corsi block-tapping task.*
4. **Gameplay loop:**
   1. 9–16 lanterns float in an irregular arrangement (they drift very slowly).
   2. A subset lights up in sequence (600 ms each), then all go dark.
   3. The player taps the lanterns in the same order. Each correct tap relights the lantern.
   4. Correct → the lit lanterns rise into the sky together, their reflections trailing on the water. Span +1 via staircase.
   5. Incorrect → the lantern flickers out with a ripple and the correct next lantern gently glows. The trial ends.
   6. Session: 10 trials or 3 misses.
5. **Controls:** *Mobile:* tap lanterns (≥ 56 px hit area). *Desktop:* click; keyboard mode overlays a 4×4 letter grid (`Q W E R / A S D F / …`) mapped to nearest lanterns, or arrow keys to move a focus ring plus `Space`.
6. **Difficulty progression:** Span 2 → 9 (2-up/1-down). Lantern count grows 9 → 16. Layout irregularity increases (a grid early, organic scatter later). Late levels add slow drift *during* recall (positions shift a few %), and **mirror trials** where the reflection lights instead of the lantern.
7. **Scoring/failure:** span² × 5 per success (rewards long spans). 3 misses end the session. Stats: best span, perfect trials.
8. **Visual/art direction:** Warm lantern light (amber, rose, jade) against a blue-black lake. Planar reflection (tier-gated, a screen-space fake on Low), gentle water normal map, mist, mountains silhouetted against a moonlit sky. Lanterns have distinct **patterns** (stripes, dots, waves) for high contrast.
9. **Engine/tools:** R3F, drei `MeshReflectorMaterial` (Medium+) or a custom cheap reflection, instanced lanterns, point-light emulation via emissive plus bloom (no real point lights on mobile), GSAP for the rise sequence. Lantern model is Kenney/Quaternius CC0 or procedural.
10. **Sound/feedback:** A soft wooden "tok" plus a rising pitch step for each lit lantern in order. Success releases a gentle whoosh plus a wind-chime cascade as the lanterns rise. A miss plays a water "plip" plus a descending two-note figure. Ambient lapping water and distant frogs.
11. **Accessibility:** Visual-only playable, with patterns for high contrast. In reduced motion, drift is disabled and the rise becomes a fade-up. Relaxed timing slows presentation. There's no response timer. Audio cues (pitch steps) help but aren't required. Optional "show order hints after miss."
12. **Session length:** 2–4 minutes.
13. **Feed preview:** Slow dolly across the lake. Four lanterns light in sequence, go dark, then are "tapped" in order, and all four rise into the night with reflections trailing.
14. **Fun and replayability:** Very calm but tense in a good way, and the lantern release moment is gorgeous. Organic layouts mean every trial feels new, and mirror trials add late-game novelty.

---

### Game 4 — Glyphfield

1. **Name:** Glyphfield
2. **Core concept:** A field of softly glowing runes drifts like plankton. Somewhere in the field is the one glyph that matches the target shown at the top. Find it and tap it before the field shifts.
3. **Target ability:** Selective attention (visual search, feature and conjunction search). *Science note: based on Treisman-style visual search paradigms.*
4. **Gameplay loop:**
   1. A target glyph is shown in the "seal" at the top.
   2. A field of 10–80 glyphs appears. Exactly one matches (or, in 20% of trials at higher levels, **none** match and the player taps "Not here").
   3. Tap the matching glyph. It bursts into light and the seal refills with a new target.
   4. Round: 60 s. Find as many as possible. Streaks build a multiplier.
5. **Controls:** *Mobile:* tap the glyph (minimum glyph hit area 44 px; the field auto-scales to guarantee it) or tap the "Not here" button. *Desktop:* click; keyboard mode divides the field into a 3×3 sector grid (numpad `1–9` zooms into a sector, then arrow keys cycle glyphs in it and `Space` selects).
6. **Difficulty progression:** Distractor count 10 → 80. Distractor similarity progresses from *feature search* (target differs in one obvious feature) to *conjunction search* (shares features with multiple distractor groups) to *rotated* glyphs. Later levels add gentle drift and "breathing" (scale pulse) of distractors, plus the "Not here" trials. Staircase targets ~80% within a 6 s window.
7. **Scoring/failure:** +100 × multiplier per find (multiplier up to ×5 with a streak). A wrong tap resets the multiplier and costs 2 s. Timer-based round. Stats: finds, average search time, best streak.
8. **Visual/art direction:** An underwater-bioluminescent look: glyphs are line-art runes (custom SVG set of ~120 in-house glyphs built from shared strokes so similarity is controllable). Soft teal/violet glow, depth-of-field blur on a background layer of out-of-focus glyphs (decorative only, never search targets), caustic light shader over the scene.
9. **Engine/tools:** PixiJS v8, glyphs pre-rendered to an atlas via SVG → texture at load, `ParticleContainer` for up to 200 sprites, glow filter (tiered), custom caustics fragment shader. Glyph generator in `logic/` controls feature overlap.
10. **Sound/feedback:** Find → crystalline ping ascending with the streak. Wrong → soft muted pluck. Ambient underwater drone with occasional whale-like pads. Haptic tick on find.
11. **Accessibility:** Glyphs are defined purely by **shape**, never color. High contrast gives white glyphs on near-black with outline and no caustics. Relaxed/no-time-pressure mode uses a trial-based round (15 trials, untimed) instead of 60 s. Text size scaling enlarges glyphs and reduces field density. Reduced motion: static field.
12. **Session length:** 2–3 minutes (2–3 rounds).
13. **Feed preview:** The field drifts, the target seal shows a rune, a subtle search "ripple" moves around, and the ghost taps the target, which bursts with light. A new target appears, three finds in a row build the streak meter.
14. **Fun and replayability:** "Where's Waldo" satisfaction with escalating challenge. Streaks and multipliers create rhythm. Procedural glyph generation means the field never repeats.

---

### Game 5 — Night Harbor

1. **Name:** Night Harbor
2. **Core concept:** You're the lighthouse keeper. Ships pass through the beam all night. Most are ordinary, but occasionally a ship shows the **signal pattern** (two flags, a specific lamp sequence). Tap to raise the harbor bell only for signal ships. Stay attentive through long quiet stretches.
3. **Target ability:** Sustained attention (vigilance). *Science note: inspired by continuous performance tasks (CPT) and the SART family.*
4. **Gameplay loop:**
   1. The beam sweeps. Ships glide across the harbor at irregular intervals.
   2. Each ship shows a lamp configuration. Target ships match the signal shown on the lighthouse panel (e.g. ▲ ● ▲).
   3. Tap to ring the bell when a target ship is in the beam. Do nothing for non-targets.
   4. Targets are rare (10–20%), and non-targets that are *almost* the target (lures) appear too.
   5. A round is ~90–120 s. Correct responses light a harbor house. By dawn the town is lit.
5. **Controls:** *Mobile:* tap anywhere (big hit area) or the bell button. *Desktop:* `Space` or click.
6. **Difficulty progression:** Target rarity (20% → 8%), ship speed (and thus response window) variation, lure similarity (differs by 1 lamp → differs by lamp order), inter-ship intervals become more irregular, and fog density reduces visible time (not below the 3:1 contrast floor). Round length 90 → 150 s.
7. **Scoring/failure:** Hit +50, false alarm −25, miss −10, streak bonus for consecutive correct rejections + hits. No lives. Stats: hit rate, false-alarm rate, "watch quality" (d′-inspired but shown simply as a 1–5 lamp rating), and longest attentive streak.
8. **Visual/art direction:** A stylized coastal night, gently rolling water shader, volumetric-looking lighthouse beam (additive sprite cone), silhouetted ships with glowing lamps, stars, and a slow dawn gradient across the round (a lovely time-lapse from night to sunrise). Lamps use **shape-coded** symbols (▲ ● ■).
9. **Engine/tools:** PixiJS, custom water displacement filter, additive blend beam, GSAP for day-night gradient. Ships are in-house flat vector silhouettes → atlas.
10. **Sound/feedback:** Soft waves, creaking wood, distant gulls at dawn. Bell ring (warm brass) on hits. False alarm plays a muted buoy clank. Missed target: its lamp fades with a soft falling tone. The music bed evolves from night to dawn.
11. **Accessibility:** Shape-coded lamps. High contrast turns ships into outlined white lamps on dark with no fog. Relaxed timing slows ships. One-button input suits switch access. Sound is not required. For photosensitivity, the beam sweep is slow and low-contrast, with no strobing. Reduced motion: water static, beam replaced with a steady spotlight zone.
12. **Session length:** 3–4 minutes (2 rounds).
13. **Feed preview:** Wide shot of the harbor as the beam sweeps. Ordinary ships pass, then a signal ship enters and the bell rings, a house window lights, and a sped-up night-to-dawn gradient plays during the loop.
14. **Fun and replayability:** A cozy fantasy of keeping watch with a satisfying progression (the town lights up). Vigilance games are usually dull, but here the dawn arc, lures, and streaks turn it into a relaxing challenge.

---

### Game 6 — Shoal

1. **Name:** Shoal
2. **Core concept:** A school of identical glowing fish swims in a coral pool. A few fish briefly glow gold, then fade back to normal. The school swirls, and when it stops, find the fish that were tagged.
3. **Target ability:** Divided attention / multiple object tracking. *Science note: based on the multiple object tracking (MOT) paradigm (Pylyshyn & Storm).*
4. **Gameplay loop:**
   1. 8–16 fish swim idly. 2–5 are tagged (glow + ring marker) for 2 s.
   2. The tags fade and the school swims in swirling, crossing paths for 5–10 s.
   3. The school freezes. The player taps the fish they believe were tagged.
   4. Correct fish reveal golden scales. Wrong ones show a gentle bubble puff.
   5. Trial score shown. 8 trials per session.
5. **Controls:** *Mobile:* tap fish (hit area ≥ 52 px; fish size scales to guarantee it). *Desktop:* click; keyboard mode numbers each fish after freeze (keys `1–9`, `0`, `Q–P`).
6. **Difficulty progression:** Tagged count 2 → 5, total fish 8 → 16, speed, tracking duration 5 → 10 s, path crossings/occlusion (swimming behind coral), and late-level "flash-outs" (brief dimming mid-track). Staircase on tagged count × speed.
7. **Scoring/failure:** +25 per correct tag, perfect trial bonus ×2. There's no failure state. The session is 8 trials. Stats: best perfect streak, max fish tracked.
8. **Visual/art direction:** Top-down view into a shallow reef pool: caustic light on sand, soft coral silhouettes, bioluminescent fish with trailing fin ribbons, and light shafts. Tagging uses a **ring marker plus glow** (not color alone).
9. **Engine/tools:** R3F with an orthographic top-down camera, instanced fish with a vertex-shader tail wiggle, boids-inspired motion constrained to controlled crossing paths generated in `logic/` (deterministic per seed), a caustics shader, and bloom.
10. **Sound/feedback:** Bubbly ambient with soft water tones. Tagging gives a chime per fish. Correct reveal plays a bright ascending plink per fish, perfect trial gets a shimmering flourish, and a wrong pick a muffled bubble. Haptic ticks on selection.
11. **Accessibility:** Tag indication is ring plus glow plus a brief outline pulse, with no color reliance. High contrast gives white fish on dark with no caustics. Relaxed timing slows the swim. Reduced motion: slower, smoother paths with no fast darting (the core motion remains, it's the mechanic), and this is flagged in the info sheet. No response time limit.
12. **Session length:** 2–3 minutes.
13. **Feed preview:** Three fish glow gold, the school swirls hypnotically, freezes, and the ghost taps three fish, which burst into golden scales with a shimmering flourish.
14. **Fun and replayability:** The swirl is mesmerizing, and there's a real "gotcha" moment of confidence or doubt. Procedural paths ensure infinite variety, and the ceiling (5 fish at high speed) is a real feat.

---

### Game 7 — Glimpse

1. **Name:** Glimpse
2. **Core concept:** Through a camera shutter, a scene flashes for a split second: a creature in the center and a firefly somewhere on the edge. Say which creature you saw and where the firefly was.
3. **Target ability:** Visual processing speed and useful field of view. *Science note: inspired by Useful Field of View (UFOV) research paradigms.*
4. **Gameplay loop:**
   1. A fixation point (small shutter icon) appears in the center.
   2. The scene flashes for a brief duration (starting 250 ms): a central creature (one of 2–4 options) and a peripheral target at one of 8 radial positions, followed by a soft pattern mask.
   3. Response 1: pick the central creature from 2–4 options (shown as large buttons).
   4. Response 2: tap the radial position where the peripheral target appeared.
   5. Next trial. 20 trials per round.
5. **Controls:** *Mobile:* tap creature buttons, then tap one of 8 radial "petals." *Desktop:* keys `1–4` for creature, then numpad/arrow compass (`↑ ↗ → …` via numpad `8 9 6 3 2 1 4 7`), or click.
6. **Difficulty progression:** Exposure duration 250 ms → 17 ms-steps down (adaptive 3-down/1-up). Peripheral eccentricity increases. Distractors are added in the periphery (up to 23 look-alike shapes). Central options increase from 2 → 4 with more similar creatures.
7. **Scoring/failure:** Both correct = +100 × speed factor. One correct = +30. Score emphasizes lowest exposure achieved. Stats: fastest exposure with 75% accuracy ("your glimpse speed"), peripheral accuracy.
8. **Visual/art direction:** A photography/film aesthetic: aperture iris transition, warm film grain (off in high contrast), creatures as minimal geometric animal icons (fox, owl, hare, deer) with distinct silhouettes, a peripheral firefly as a distinct star shape. The mask is a soft kaleidoscopic pattern (not flashing, low contrast).
9. **Engine/tools:** PixiJS for frame-accurate presentation (duration measured in frames at the actual refresh rate, detected at start; displayed exposure rounded to frame multiples). Aperture shader for the transitions.
10. **Sound/feedback:** Camera shutter click at exposure, soft developing-film "whirr" after answering, correct gives a pleasant shutter "ka-ching" chime, and wrong a gentle lens-cap thump.
11. **Accessibility:** **Photosensitivity:** the flash is a brief *appearance* of content at controlled luminance, never a white flash. The mask is low-contrast. The rate is well under 3 Hz. Brightness change stays within safe bounds. High contrast gives outlined silhouettes. Response entry is untimed. Reduced motion simplifies the iris transition to a fade. This is flagged as a speed-based perception game with no substitute for the timing.
12. **Session length:** 2–3 minutes.
13. **Feed preview:** An aperture opens, a quick scene appears, the mask follows, and the ghost picks "Owl" and the upper-right petal, which rings correct. The loop plays the scene again in slow motion to show what flashed, which reads clearly in a feed.
14. **Fun and replayability:** The "did I just see that?" thrill, and a personal glimpse speed that measurably drops (in ms) as you practice, which makes mastery feel tangible. Varied creature/scene themes (forest, desert, snow) rotate by seed.

---

### Game 8 — Silhouette

1. **Name:** Silhouette
2. **Core concept:** An abstract sculpture floats in a gallery lit by a single lamp. Its shadow on the back wall must match a target silhouette etched into the wall. Rotate the sculpture until the shadow clicks into place.
3. **Target ability:** Spatial reasoning (mental rotation). *Science note: inspired by Shepard & Metzler mental rotation research.*
4. **Gameplay loop:**
   1. A sculpture made of cubes/rounded blocks (polycube) floats in the center. The wall shows a target outline.
   2. The player rotates the sculpture in 90° steps on two axes (swipe or buttons). The live shadow updates.
   3. When the shadow matches the target (with any valid orientation), the outline fills with light, the sculpture settles onto a plinth, and the next sculpture appears.
   4. **Choice trials** (every 4th): three sculptures, and the player picks which one *could* cast the shown shadow, with no rotation allowed. This is pure mental rotation.
   5. Round: 6 puzzles. Fewer moves earns a "perfect" star.
5. **Controls:** *Mobile:* swipe left/right to rotate around the vertical axis, up/down for horizontal, or tap on-screen rotate buttons (left-handed option mirrors them). *Desktop:* arrow keys/WASD, or drag. Choice trials: tap/`1–3`.
6. **Difficulty progression:** Block count 3 → 8, from symmetric → asymmetric shapes, rotation axes 1 → 2 → 3 (roll unlocked late), chiral pairs (mirror-image distractors) in choice trials, and a move limit appears at higher levels.
7. **Scoring/failure:** 100 per puzzle + perfect bonus (optimal moves computed via BFS in `logic/`). Choice trials +150 correct, 0 wrong. No lives. Stats: perfect solves, choice accuracy.
8. **Visual/art direction:** Minimalist gallery with warm plaster walls, a single dramatic lamp (a real-time directional shadow on this *one* object is the showpiece, so the shadow budget goes here), matte ceramic sculptures with subtle subsurface feel, and dust motes in the light. Monument Valley meets a museum.
9. **Engine/tools:** R3F with one dynamic shadow-casting light (1024 Medium, 2048 High), shadow comparison done logically (project the voxel set onto a plane → 2D bitset equality, never pixel comparison), GSAP-eased 90° rotation tweens, and a soft SSAO fake via baked AO textures.
10. **Sound/feedback:** Stone-on-stone "clunk" for each rotation (pitch varies by axis), a resonant chord and brightening lamp when the shadow matches, choice-correct plays a gallery-bell tone. Ambient soft room tone and a distant piano.
11. **Accessibility:** Shape-based puzzle, no color reliance. High contrast gives a black shadow on white wall with a bold target outline. No time pressure by default. Rotation is discrete, fitting motor-impairment needs. Reduced motion: instant rotation with a fade. A "hint" option previews the next correct rotation (with a score cost).
12. **Session length:** 3–5 minutes.
13. **Feed preview:** The lamp flickers on, the sculpture rotates twice with satisfying clunks, the shadow slides into the etched outline and lights up, then the camera pushes in.
14. **Fun and replayability:** A tactile puzzle feel with an elegant "aha" moment. Hundreds of procedurally generated polycubes and move-optimal stars reward mastery.

---

### Game 9 — Loom

1. **Name:** Loom
2. **Core concept:** A magical loom weaves a patterned tapestry, but one tile is missing. Study the rows and columns, infer the rule (rotation, count, progression, symmetry), and choose the tile that completes the weave.
3. **Target ability:** Pattern recognition and abstract reasoning. *Science note: inspired by matrix reasoning tasks (e.g. Raven's Progressive Matrices).*
4. **Gameplay loop:**
   1. A 3×3 (later 4×4) grid of woven tiles is shown with one empty slot.
   2. The player chooses from 4–6 candidate tiles in a tray.
   3. Correct → the thread weaves the tile in with a flowing animation, and the tapestry extends. Wrong → the thread snaps softly, and the player can try again (reduced points).
   4. Round: 8 puzzles, which become a single long tapestry revealed at the end (a beautiful artifact).
5. **Controls:** *Mobile:* tap a candidate (or drag it into the slot). *Desktop:* click or keys `1–6`.
6. **Difficulty progression:** Rule count per puzzle 1 → 3 (combined), rule types progress (shape progression → rotation → count → XOR/overlay → distribution-of-three), grid 3×3 → 4×4, and candidate count 4 → 6 with closer distractors (generated by violating exactly one rule). Staircase on rule complexity.
7. **Scoring/failure:** First-try correct 100, second 40, third 10. No lives. Stats: first-try streak, hardest rule solved.
8. **Visual/art direction:** Textile warmth: tiles look like embroidered/woven cloth (normal-mapped fabric texture, thread highlights), jewel-toned palettes inspired by global textile traditions (curated respectfully, geometric rather than culturally specific sacred motifs), and a wooden loom frame with a shuttle animation.
9. **Engine/tools:** PixiJS with tiles rendered procedurally (Graphics → cached textures), a fabric normal-map filter for lighting, a thread-weaving shader (animated UV mask). The puzzle generator (`logic/`) follows a rule-grammar approach with a solver to guarantee a single correct answer.
10. **Sound/feedback:** Wooden loom clack and shuttle whoosh. A correct tile plays a harp-like pluck and weaving hum. Wrong plays a thread-snap (soft, not jarring). Tapestry completion gets a warm string motif.
11. **Accessibility:** Rules never use color as the only varying property (color may co-vary with shape but is never the solver's sole information). High contrast gives monochrome tiles with bold strokes. No time limit. Large tiles. Screen-reader descriptions for tiles are a V2 exploration (noted as a known limitation). Reduced motion: instant placement.
12. **Session length:** 3–5 minutes.
13. **Feed preview:** The camera pans across a tapestry grid with one empty slot. The candidate tiles float up, the ghost picks one, and golden thread weaves it in and extends the tapestry.
14. **Fun and replayability:** The "aha!" of cracking a rule. The procedural generator provides effectively unlimited puzzles, and players can export their tapestry from each session as a shareable image (a local download; no social).

---

### Game 10 — Rhyme Tide

1. **Name:** Rhyme Tide
2. **Core concept:** A gentle voice says a word ("butterfly"). Its syllables wash in on the waves as floating shells. Catch them in the right order to rebuild the word. At other times, catch the shell that **rhymes**, or the one that **starts with the same sound**.
3. **Target ability:** Phonological awareness (syllable segmentation, rhyme, onset). *Science note: phonological awareness tasks are widely used in early-reading research. This game is practice, not a dyslexia intervention.*
4. **Gameplay loop:**
   1. A prompt is spoken (and optionally shown as text) with a task icon: *Build* (syllables), *Rhyme*, or *Same start*.
   2. Shells carrying syllables/words (spoken when touched or when they arrive) float in on waves.
   3. *Build:* tap syllable shells in order to form the word. *Rhyme/Same start:* tap the shell that matches.
   4. Correct → the shell opens and a pearl joins your necklace, and the word is spoken whole. Wrong → the shell closes and drifts back, and the correct one gently glows.
   5. Round: 10 prompts, with task types mixed.
5. **Controls:** *Mobile:* tap shells (≥ 64 px), and tap the speaker icon to replay audio. *Desktop:* click, or keys `1–4` for visible shells, and `R` to replay.
6. **Difficulty progression:** Word length (1–2 → 3–5 syllables), task mix (rhyme → onset → syllable build → later **phoneme** tasks like "which word has the /k/ sound in the middle?"), distractor similarity (near-rhymes like "cat/cap"), wave speed (only in timed mode), and text visibility (text shown → text optional → audio only at higher levels by player choice).
7. **Scoring/failure:** +10/pearl, perfect-round bonus. No lives. Stats: pearls, accuracy per task type.
8. **Visual/art direction:** A warm-dusk beach, turquoise stylized water with foam shader, pastel shells with pearlescent iridescence (a thin-film shader), and a pearl necklace that fills along the top. Friendly, not childish, like a Pixar short aesthetic done minimal.
9. **Engine/tools:** PixiJS, wave displacement filter, iridescence shader for shells. **Recorded voice** (2 voice actors, word + syllable + phoneme recordings, Opus/AAC), with sprite-sheet audio (one file + JSON offsets per level pack). Word/phoneme data lives in `@utopia/content` (IPA, syllabification, rhyme groups).
10. **Sound/feedback:** Voice at center stage. The music is minimal (gentle ukulele/marimba, ducked heavily under voice). Waves are soft. Correct plays a pearl "clink" and the full word spoken. Wrong plays a soft shell closing.
11. **Accessibility:** **requiresAudio = true** for pure-audio tasks, clearly tagged. Text display is on by default, with a dyslexia-friendly font option, and the "Show text" option makes most tasks playable for deaf/HoH players (rhyme via spelling where valid, flagged imperfect). Replay audio unlimited. No time pressure by default. Mono audio support. Large shells.
12. **Session length:** 2–4 minutes.
13. **Feed preview:** A wave brings in three shells ("but-", "-ter-", "-fly") with text visible (the feed is muted). The ghost taps them in order, they snap together with a sparkle to spell "butterfly," and a pearl drops into the necklace.
14. **Fun and replayability:** Wordplay is delightful, and the necklace collection gives a sense of progress. A large word bank (~1,500 curated words in V1, English only) keeps it fresh, and the mixed task types keep your brain switching.

---

### Game 11 — Word Current

1. **Name:** Word Current
2. **Core concept:** Words float down a glowing river on leaves. Real words should be guided into the **lantern bank** (left), and made-up words (pseudo-words like "blark," "frimp") into the **fog bank** (right). Read fast, sort true.
3. **Target ability:** Reading fluency (lexical decision / word recognition speed). *Science note: based on the lexical decision task used in reading research.*
4. **Gameplay loop:**
   1. A leaf carrying a word enters from the top and drifts down.
   2. The player swipes it left (real) or right (not a word). The leaf glides into that bank.
   3. Correct → the lantern bank brightens (real) or the fog swirls (pseudo), and the streak builds. Wrong → the leaf sinks with a ripple, and the correct answer is briefly shown.
   4. A round lasts 60 s or 30 words. The river speeds up gently as the streak grows.
5. **Controls:** *Mobile:* swipe left/right, or tap the left/right halves of the screen (two big labeled zones: "Word ✓" / "Not a word ✕"). *Desktop:* `←`/`→` or `A`/`D`/`F`/`J`.
6. **Difficulty progression:** Word frequency (common → rarer), word length (3 → 9 letters), pseudo-word plausibility (illegal strings "xqtl" → orthographically legal "brene" → pseudo-homophones "brane," advanced), and drift speed. Staircase targets ~80% accuracy.
7. **Scoring/failure:** +10 × streak tier per correct. A wrong answer breaks the streak. The round is time/count-based, no lives. Stats: words per minute (correct), accuracy, best streak.
8. **Visual/art direction:** A nocturnal river with glowing lily-pad leaves, a starry reflection on the water, a warm lantern bank on the left and a mystical mist bank on the right (sides are labeled with icons ✓/✕ and words, never color alone). Words in a clean, highly readable font over a dark leaf plate for contrast.
9. **Engine/tools:** PixiJS, text rendered with BitmapText (pre-generated SDF font atlases for crisp scaling), water flow shader, swipe gesture detection via `@utopia/input`. Word/pseudo-word lists live in `@utopia/content` (pseudo-words generated by a syllable-grammar tool plus human review to avoid real/offensive words).
10. **Sound/feedback:** Soft water flow. A correct "real word" plays a lantern "whoomph" plus a warm tone, and a correct "pseudo" a mist whoosh. Wrong plays a plop and sink sound. The streak raises the musical intensity (adds layers).
11. **Accessibility:** Font choice (default / Atkinson Hyperlegible / OpenDyslexic), text size scaling, adjustable letter spacing, relaxed timing (slower river) and untimed mode (word waits until sorted). High contrast gives white text on black leaves. Sides are labeled. Sound is not required. Note in the info sheet: English only in V1.
12. **Session length:** 2–3 minutes.
13. **Feed preview:** Leaves drift down with words "garden," "flonk," "bright," and the ghost swipes them into the lantern/fog banks rapidly as the streak meter climbs and the lantern bank blooms brighter.
14. **Fun and replayability:** A satisfying swipe rhythm and a funny pseudo-word vocabulary ("snorgle"). Words per minute gives a clear personal metric, and a large list keeps it fresh.

---

### Game 12 — Prism Sort

1. **Name:** Prism Sort
2. **Core concept:** Crystals drop onto a pedestal. Sort each into one of two portals. The sorting rule (by shape, by number of facets, by pattern) is never stated: discover it from feedback, and stay alert because it changes without warning.
3. **Target ability:** Cognitive flexibility (rule discovery and set-shifting). *Science note: inspired by the Wisconsin Card Sorting Test and task-switching paradigms.*
4. **Gameplay loop:**
   1. A crystal appears with three attributes: **shape** (tetra, cube, octa), **count** (1–3 clustered), and **surface pattern** (smooth, striped, dotted). Color co-varies with pattern as a redundant cue.
   2. Two portals each display an example crystal. The player sorts the crystal into the portal that matches under the current (hidden) rule.
   3. Correct → the crystal refracts light through the portal. Wrong → it clatters back and the portal dims.
   4. After 5–8 consecutive correct sorts, the rule silently switches.
   5. Later levels add **cued switching** trials: a glyph above the pedestal explicitly indicates the rule (shape/count/pattern icon) and changes frequently, training fast task switching.
   6. Round: 40 crystals.
5. **Controls:** *Mobile:* swipe the crystal left/right, or tap a portal. *Desktop:* `←`/`→`, or click.
6. **Difficulty progression:** Rule switch frequency (every 8 correct → every 5), number of attributes (2 → 3 → 4 with "orientation" added), cued switching (introduced mid-game, then mixed with uncued), response window (only in timed mode), and portal examples that share more attributes (ambiguous).
7. **Scoring/failure:** Correct +10, streak ×. Tracked: **perseverative errors** (continuing the old rule after a switch), shown friendlily as "shifts spotted" (how quickly you adapted after each switch). No lives.
8. **Visual/art direction:** A crystalline temple interior, refraction and dispersion effects (a chromatic aberration shader on crystals), rainbow light caustics, a dark marble floor with reflections, and glowing portals as ring gates. Premium, jewel-like.
9. **Engine/tools:** R3F, `MeshTransmissionMaterial` (drei) on High only; Medium/Low use a cheaper fake refraction (matcap + fresnel). Instanced crystal meshes (procedural polyhedra), bloom, GSAP for sort arcs.
10. **Sound/feedback:** Crystalline chimes whose pitch rises with streaks. Wrong plays a glassy "tink" (soft). An adaptation after a switch gets a special "shift" sparkle sound, which celebrates flexibility. Ambient temple reverb pad.
11. **Accessibility:** All attributes are distinguishable by **shape/count/pattern** (color is redundant only). High contrast gives white crystals with bold pattern textures. No time pressure by default. Reduced motion: no arc animation, instant teleport with fade. Rules are unstated by design, and a "How it works" explanation clarifies that discovering rules *is* the game.
12. **Session length:** 2–4 minutes.
13. **Feed preview:** Crystals drop and the ghost sorts them as rainbow light refracts through the portals. A rule switch happens, the ghost errs once (clatter), adapts, and the "Shift spotted!" sparkle appears.
14. **Fun and replayability:** A detective feeling ("what's the rule now?"), a gorgeous crystal aesthetic, and endless combinations. "Shifts spotted" is a novel, satisfying metric.

---

### Game 13 — Firefly Night

1. **Name:** Firefly Night
2. **Core concept:** In a twilight meadow, fireflies and moths appear among the grass. Tap fireflies to collect their glow into a jar, but spare the moths. When the wind chime rings and the meadow shimmers, freeze and don't tap anything.
3. **Target ability:** Inhibition (response inhibition via go/no-go plus a stop signal). *Science note: based on go/no-go and stop-signal paradigms.*
4. **Gameplay loop:**
   1. Insects appear briefly at random meadow positions (each visible for ~900 ms at start).
   2. Firefly (round glowing body, blinking) → tap. Moth (triangular dusty wings, no glow) → don't tap.
   3. **Stop trials** (25% of fireflies): a moment after a firefly appears, a wind chime rings and the grass ripples (visual + audio stop signal). The player must withhold.
   4. Fireflies are frequent (~75%), which builds a prepotent tapping habit that makes withholding hard.
   5. The jar fills with light. A round is 60 s. Three rounds, with a moonrise between rounds.
5. **Controls:** *Mobile:* tap the insect (hit ≥ 56 px). *Desktop:* click, or `Space` as a single response key (in keyboard mode, insects appear only in one central spot to make single-key play fair).
6. **Difficulty progression:** Visibility window (900 → 450 ms), stop-signal delay adaptive (the staircase adjusts delay after firefly onset so stops succeed ~50%, the standard stop-signal tracking method), moth resemblance (differs strongly → subtly), and simultaneous insects (1 → 3).
7. **Scoring/failure:** Firefly caught +10 (faster = bonus up to +5). Moth tapped −15. Stop trial withheld +20, failed −10. No lives. Stats: jar fullness, "calm hands" (stop success %), average catch time.
8. **Visual/art direction:** Magic-hour meadow, deep blue sky gradient with first stars, parallax grass layers swaying (shader-driven), fireflies with soft additive glow and blink, moths as dusty wing silhouettes, and a jar in the corner filling with swirling light particles.
9. **Engine/tools:** PixiJS, grass as instanced sprite strips with vertex-sway filter, additive-blend glow particles, and high-resolution RT measurement using `event.timeStamp` on `pointerdown`.
10. **Sound/feedback:** Crickets, soft wind. A firefly catch plays a twinkling bell (ascending scale across a streak). A moth tap plays a dusty flutter plus a muted thud. The stop signal is a clear **wind chime** plus grass ripple (the chime is distinct from all other sounds). A successful withhold plays a soft "hush" chord. Haptic on catch.
11. **Accessibility:** Firefly vs. moth are distinguished by **shape** and **blink** (not color). The stop signal is audio *and* visual (grass ripple plus an on-screen ring pulse), so it's playable with sound off. Relaxed timing widens windows. Reduced motion: grass static, but the stop-signal ring remains (it's essential). Photosensitivity: the blink rate is < 3 Hz and low-intensity.
12. **Session length:** 2–3 minutes.
13. **Feed preview:** Fireflies pop up across the meadow, the ghost catches several (jar fills), a moth appears and the ghost resists, the chime rings, and the ghost freezes with a soft "hush" glow.
14. **Fun and replayability:** A fast, tactile catching rhythm with a clever built-in tension (the habit you build is the thing you must resist). The jar and moonrise give a sense of closure.

---

### Game 14 — Upstream

1. **Name:** Upstream
2. **Core concept:** A school of koi swims in formation. Swipe in the direction the **lead koi** (the center one, marked with a golden crown fin) is facing, ignoring the fish around it, which may face other ways.
3. **Target ability:** Interference control (attention under conflicting cues). *Science note: based on the Eriksen flanker task.*
4. **Gameplay loop:**
   1. A formation of 5 (later up to 9) koi appears, with the lead koi in the center.
   2. Flankers are *congruent* (same direction), *incongruent* (opposite), or *neutral* (sideways/still).
   3. The player swipes the lead koi's direction (left/right, later up/down too). The whole school darts that way if correct.
   4. Wrong → the school scatters briefly, then reforms.
   5. Trials come in a flowing rhythm. A round is 40 trials.
5. **Controls:** *Mobile:* swipe in the direction (or tap left/right halves, and in 4-direction mode tap quadrants). *Desktop:* arrow keys / WASD.
6. **Difficulty progression:** Incongruent proportion (30% → 60%), response window (2 s → 800 ms in timed mode), formation variants (lead not always centered but always crowned), 4 directions, and a "current" effect (the formation drifts, so its position varies).
7. **Scoring/failure:** Correct +10, speed bonus. Streak multiplier. Tracked: congruent vs. incongruent accuracy and RT, shown as "Focus under pressure: incongruent accuracy." No lives.
8. **Visual/art direction:** A top-down pond with ink-wash (sumi-e) style: paper texture, soft ink bloom for ripples, koi with elegant brush-stroke fins (lead koi with a distinct golden crown fin **and** a larger size plus a subtle halo ring), and falling petals. Minimal, beautiful, calm-but-quick.
9. **Engine/tools:** PixiJS, an ink-diffusion ripple shader (ping-pong render textures, Medium+; simple sprite ripples on Low), fish as skeletal sprite strips with procedural tail sway, and GSAP for school movement.
10. **Sound/feedback:** Water swishes, a koto/shakuhachi-inspired ambient bed (licensed or commissioned). Correct plays a pentatonic koto pluck (rising with streak). Wrong plays a splash scatter. Haptic on correct.
11. **Accessibility:** The lead koi is distinguished by **size, crown fin, halo ring, and position** (not color). High contrast gives black koi on white paper. Relaxed timing is available, and untimed mode is available (the RT metric is then hidden). Reduced motion: no petals and a gentler dart.
12. **Session length:** 2–3 minutes.
13. **Feed preview:** An ink-wash pond as formations appear and the ghost swipes. The school darts gracefully, an incongruent formation appears and is solved correctly, and ink ripples bloom beautifully.
14. **Fun and replayability:** A zen aesthetic with a surprisingly intense challenge. Flowing rhythm, streaks, and formation variety make "one more round" easy.

---

### Game 15 — Zenith

1. **Name:** Zenith
2. **Core concept:** Comets orbit a small planet on luminous rings. Tap at the exact moment each comet passes through the zenith gate at the top of its orbit. A perfect hit makes it explode into stardust that joins the planet's aurora.
3. **Target ability:** Reaction and anticipation timing (coincidence anticipation). *Science note: based on coincidence-anticipation timing tasks.*
4. **Gameplay loop:**
   1. A comet travels along a circular orbit toward the gate.
   2. The player taps when the comet is inside the gate. Timing accuracy is graded as Perfect (±30 ms), Great (±70 ms), or Good (±120 ms), otherwise a miss.
   3. Hits add aurora color to the planet. Misses make the comet fly off into space.
   4. Waves: multiple rings, comets at different speeds, **occluded arcs** (the comet passes behind a moon and you must predict its reappearance), and **reversals** later.
   5. 3 lives (misses). A session ends after lives are lost or wave 10 is completed.
5. **Controls:** *Mobile:* tap anywhere (or tap the specific ring when multiple rings are active, which get large ring-shaped hit zones). *Desktop:* `Space`, or `J`/`K`/`L` for rings 1–3.
6. **Difficulty progression:** Comet speed, number of simultaneous rings (1 → 3), occlusion length, speed changes mid-orbit (acceleration), and gate size shrinkage (wider in relaxed mode).
7. **Scoring/failure:** Perfect 100, Great 60, Good 30, plus combo multipliers. 3 misses end it. Stats: perfect %, mean timing error in ms (early/late tendency shown as a small histogram, which is useful feedback), best combo.
8. **Visual/art direction:** A tiny stylized planet (low-poly with soft atmosphere shader) in deep space. Orbits as thin glowing rings, comets with long particle tails, and the aurora building up around the planet over the session (a satisfying visual progress bar). Minimal HUD.
9. **Engine/tools:** R3F, particle trails via instanced quads, atmosphere fresnel shader, bloom. Timing uses `performance.now()`-based comet positions (independent of frame rate) and input timestamps. **Latency calibration** is shared with Tidal Beat (§ Game 19).
10. **Sound/feedback:** Each ring has a pitch. Perfect plays a sparkling chime and stardust burst, and Great/Good play progressively softer chimes. A miss plays a Doppler whoosh away. An ambient space pad builds with the combo.
11. **Accessibility:** Timing is the core ability, so relaxed mode widens windows 1.5–2× and slows comets. High contrast gives bright white rings with a bold gate outline. Audio has a ticking "approach" cue (optional) to support low-vision players. Reduced motion: shorter tails, no camera sway. Flagged as `requiresFastReaction` (filterable in the feed).
12. **Session length:** 1–3 minutes.
13. **Feed preview:** Comets orbit, the ghost hits Perfect, Perfect, Great, stardust bursts, and the aurora ribbon around the planet grows brighter each hit.
14. **Fun and replayability:** Pure "one more try" timing satisfaction. The early/late histogram teaches you about yourself, and the aurora is a lovely visual reward. Daily seed wave patterns add variety.

---

### Game 16 — Orbit Keeper

1. **Name:** Orbit Keeper
2. **Core concept:** Guide a small moon through a stream of floating rings. Hold to pull the moon toward the planet's gravity, release to drift outward. One input, continuous control, in a flowing orbital dance.
3. **Target ability:** Visuomotor coordination (continuous tracking and control). *Science note: inspired by continuous pursuit-tracking tasks.*
4. **Gameplay loop:**
   1. The moon orbits the planet automatically at a constant angular speed.
   2. Holding pulls the orbit radius inward. Releasing lets it drift outward.
   3. Rings appear along the orbit at varying radii, and the player passes through them for points. Hazards (asteroid clusters) are to be avoided.
   4. Passing through consecutive rings builds a "harmony" meter that makes the trail brighter and the music richer.
   5. Hitting an asteroid costs one of 3 lives (shields). A session lasts until lives run out or the 90 s "orbit cycle" completes (an endless mode unlocks after completing the cycle once).
5. **Controls:** *Mobile:* touch-and-hold anywhere. *Desktop:* hold `Space`/mouse button. There's also a switch-access option: toggle mode (tap to switch between in/out).
6. **Difficulty progression:** Orbit speed, ring spacing and radial variance, ring size, asteroid density and moving asteroids, gravity strength variations ("heavy zones"). Adaptive: ring placement density adjusts to recent hit ratio.
7. **Scoring/failure:** Ring +10 × harmony level. Near-miss bonus for passing close to asteroids safely. 3 shields. Stats: max harmony, rings passed, survival time.
8. **Visual/art direction:** A vibrant synthwave-meets-pastel cosmos: a gradient planet, glowing rings of light, the moon trailing a ribbon trail, soft asteroid rocks, and nebula backgrounds. Colors shift as harmony increases.
9. **Engine/tools:** PixiJS with a custom trail mesh (`MeshRope`), a simple kinematic simulation (deterministic fixed-step physics in `logic/`), and additive blending glows. (Phaser was considered, but custom kinematics are simpler and lighter.)
10. **Sound/feedback:** The music is adaptive: layers are added per harmony level (bass → pads → arpeggios → lead). Ring passes play notes in a scale that form melodies. A shield hit plays a soft "shoom" and the music drops a layer. Haptic on ring pass (light).
11. **Accessibility:** One-button (or toggle) control, and one-handed. Relaxed mode slows the orbit and enlarges rings. High contrast gives white rings with dark asteroids with outlines. Reduced motion: no screen-shake and reduced parallax. Colors are not meaningful for gameplay (rings vs. asteroids differ in shape).
12. **Session length:** 1–3 minutes.
13. **Feed preview:** The moon weaves smoothly through a series of rings, the harmony meter rises, the trail brightens, the colors shift, and it swerves past an asteroid.
14. **Fun and replayability:** Flow-state control with music that responds to skill. It's endlessly replayable with procedural ring streams and addictive in a healthy "short burst" way.

---

### Game 17 — Stonepath

1. **Name:** Stonepath
2. **Core concept:** Glowing river stones rest on three wooden pillars in a misty zen garden. Rearrange them to match the target arrangement shown in the reflecting pool, in as few moves as possible.
3. **Target ability:** Planning (look-ahead problem solving). *Science note: based on the Tower of London task.*
4. **Gameplay loop:**
   1. The current arrangement is on the pillars (pillar capacities 3/2/1). The target arrangement is reflected in the pool.
   2. The player moves the top stone from one pillar to another (tap source, then destination, or drag).
   3. The move counter shows current/minimum moves.
   4. Solved → the stones glow and chime in sequence and a lotus blooms. A minimum-move solve earns a golden lotus.
   5. **Plan mode** (optional, advanced): the player must plan before moving. Stones are frozen for a "look" phase, and then the first move reveals planning time.
   6. Round: 6 puzzles.
5. **Controls:** *Mobile:* tap pillar to pick up the top stone, tap another pillar to place, or drag. *Desktop:* keys `1`/`2`/`3` (pick then place), or click/drag. Undo: `Z` / undo button (costs perfect status).
6. **Difficulty progression:** Minimum moves 2 → 7+, stone count 3 → 5 (with extra pillar capacity variants), later "goal-hidden" puzzles where the target fades after 5 s (combining working memory with planning), and variants with 4 pillars.
7. **Scoring/failure:** 100 per solve minus 10 per extra move. Golden lotus bonus +50. No failure, and there's a "Reset puzzle" option. Stats: golden lotuses, average extra moves, planning time before the first move.
8. **Visual/art direction:** A serene zen garden at dawn, raked sand (normal-mapped), soft mist, water reflections in a stone basin, glowing river stones with inner light (translucent material with emissive core), and cherry blossom petals drifting. The Monument Valley influence is strong here.
9. **Engine/tools:** R3F with baked lighting for the garden (lightmaps), a real-time glow on stones, drei `MeshReflectorMaterial` for the pool (Medium+), GSAP arc tweens for stone moves, and a BFS solver in `logic/` for min moves and puzzle generation.
10. **Sound/feedback:** Each stone has a singing-bowl tone. A stone lift plays a soft wood lift, placement a stone click. Solving plays the stones chiming together as a chord. A golden lotus gets a gong bloom. Ambient water trickle and distant birds.
11. **Accessibility:** Stones are distinguished by **size and engraved symbol** (not color). No time pressure. Undo is allowed. Discrete input. High contrast gives white stones with bold symbols on a dark background. Reduced motion: instant moves and no petals.
12. **Session length:** 3–5 minutes.
13. **Feed preview:** The misty garden and stones move in graceful arcs with click sounds (visually). The final stone settles, the arrangement matches the pool reflection, and a golden lotus blooms.
14. **Fun and replayability:** A classic puzzle made gorgeous. Optimal-move mastery gives depth, and procedurally generated puzzles with guaranteed solutions keep it fresh.

---

### Game 18 — Lumen

1. **Name:** Lumen
2. **Core concept:** A beam of light enters a floating stone temple. Rotate mirrors and prisms to guide the beam to the sleeping crystals and wake them all. When every crystal glows, the temple unfolds and reveals the next chamber.
3. **Target ability:** Planning and spatial problem solving. *Science note: an open-ended spatial planning puzzle (not based on a single lab paradigm).*
4. **Gameplay loop:**
   1. An isometric grid-based chamber contains a light source, mirrors (rotatable in 45° steps), prisms (which split the beam), blockers, and crystals.
   2. The player taps a mirror to rotate it. The beam path updates live.
   3. All crystals lit → the chamber unfolds (Monument Valley-style geometric animation).
   4. Each session presents 4–5 chambers of increasing complexity. Move efficiency earns stars.
5. **Controls:** *Mobile:* tap a mirror to rotate clockwise (long-press for counter-clockwise, or a two-button toggle). *Desktop:* click, or keyboard focus navigation (arrow keys move the selection, `Space`/`Q`/`E` rotate).
6. **Difficulty progression:** Grid size 5×5 → 9×9, mirror count, prisms (splitting), color filters (crystals need a specific beam type, which is identified by **beam pattern**, dashed vs. solid vs. dotted, as well as color), moving blockers (timed only in optional challenge mode), and multi-level chambers with vertical mirrors.
7. **Scoring/failure:** Stars based on rotations vs. optimal (1–3 stars). No failure. A hint system reveals one correct mirror (costs a star). Stats: stars, chambers solved, perfect chambers.
8. **Visual/art direction:** Monument Valley-inspired isometric architecture in soft pastels at sunset: warm sandstone, turquoise water channels, and the beam as a luminous volumetric ribbon. Crystals glow and pulse awake. Chamber unfolding is an elegant geometric rotation.
9. **Engine/tools:** R3F with an orthographic isometric camera, the beam as a custom tube/ribbon mesh with animated shader, beam tracing in `logic/` (grid raycast), a puzzle generator with a solver (reverse-generation from solution plus uniqueness pruning), baked AO and gradient lighting, and bloom.
10. **Sound/feedback:** A mirror rotation plays a stone slide and click. Beam hitting a crystal plays a sustained tone (each crystal a note, and all lit forms a chord). Chamber unfolding plays a grand harmonic swell. Ambient wind and chimes.
11. **Accessibility:** Beam types are distinguished by pattern plus color, and crystals show the required beam's pattern as an engraving. No time pressure. Discrete input. High contrast gives white beams and outlined elements on a dark background. Reduced motion: chamber unfolding becomes a fade transition.
12. **Session length:** 3–6 minutes.
13. **Feed preview:** An isometric chamber as the ghost rotates two mirrors, the beam zigzags across and splits via a prism, crystals wake with glowing chords, and the chamber folds open like origami.
14. **Fun and replayability:** A deeply satisfying puzzle "click" with a gorgeous reveal. Procedural chambers plus a hand-crafted set of 30 "signature" chambers (curated by a designer) give long-term depth.

---

### Game 19 — Tidal Beat

1. **Name:** Tidal Beat
2. **Core concept:** Waves roll onto a moonlit shore to the rhythm of the music. Tap in time with each wave crest to make the sea glow. Then the music fades out, and you must **keep the beat yourself**, with the waves following *your* timing.
3. **Target ability:** Rhythm and timing (sensorimotor synchronization and internal timing). *Science note: inspired by synchronization-continuation tapping paradigms.*
4. **Gameplay loop:**
   1. **Sync phase:** music plays with clear beats, waves crest on beats, and the player taps on beat (graded Perfect/Great/Good by timing error).
   2. **Continuation phase:** the music fades to silence (or only a soft ambient bed), the waves now crest on the player's taps, and they must maintain the tempo. The visual shows how steady their rhythm is (smooth waves = steady, choppy = drifting).
   3. **Pattern phase** (later levels): syncopated patterns (e.g. tap-tap-rest-tap).
   4. A round is ~60 s (30 s sync + 20 s continuation + 10 s pattern at higher levels). Three rounds per session at different tempos.
5. **Controls:** *Mobile:* tap anywhere. *Desktop:* `Space` or any key. A first-time **latency calibration** (tap along 8 beats) is required, with recalibration in settings (it compensates for Bluetooth headphones and device output latency).
6. **Difficulty progression:** Tempo range (60 → 140 BPM), continuation length (10 → 30 s), pattern complexity (quarter notes → eighths → syncopation → polyrhythmic hints), and grading windows tightening (±50 → ±25 ms for Perfect).
7. **Scoring/failure:** Sync points by accuracy. Continuation scored by tempo stability (low coefficient of variation) and drift (deviation from original tempo). There's no failure, and the session is always 3 rounds. Stats: timing accuracy, steadiness %, tempo drift %.
8. **Visual/art direction:** A nocturnal beach from a low camera angle, bioluminescent waves (glowing plankton foam in cyan), the moon's reflection, and stars. Each tap sends a glow ripple along the shoreline. In continuation, the waves' smoothness visualizes steadiness beautifully.
9. **Engine/tools:** PixiJS with wave layers via displacement and custom shader. **Tone.js Transport** (lazy-loaded) for sample-accurate music scheduling. Timing measured against `AudioContext.currentTime` with `outputLatency` plus calibration offset applied, and input timestamps converted to audio clock time.
10. **Sound/feedback:** The music is ambient electronic with soft percussion (3 tracks in different tempos, commissioned or CC0). Taps trigger a soft marimba note on-scale (so tapping sounds musical). The continuation phase is silent except your taps and waves. Perfect taps add sparkles of sound. Optional metronome click in settings.
11. **Accessibility:** **Visual-only playable** (waves show the beat in sync phase, and a pulsing ring option is available). Haptic beat pulse on Android (optional). High contrast gives bright wave outlines on black. Relaxed mode widens grading windows. Deaf/HoH players can use visual beats (flagged: best with sound). Reduced motion: waves simplified to a pulsing horizon line.
12. **Session length:** 2–3 minutes.
13. **Feed preview:** Glowing waves crest rhythmically, tap ripples shimmer along the shore, then the music drops in a caption "Now keep the beat…", the waves continue smoothly, and a "Steady 94%" ring appears.
14. **Fun and replayability:** Rhythm games are inherently joyful. The continuation twist is novel and personally revealing (most people speed up), and different tempos and patterns give lots of room for mastery.

---

### Game 20 — Still Water

1. **Name:** Still Water
2. **Core concept:** A single lotus floats on a dark pond. Breathe with it: press and hold as it expands (inhale), release as it contracts (exhale). Keep the ripples calm. Occasionally a leaf drifts in (a "thought"). Notice it with a gentle tap, and return to the breath.
3. **Target ability:** Calm attention (breath-paced focused attention and noticing). *Science note: inspired by breath-counting and focused-attention practices. Not therapy or a treatment for anxiety.*
4. **Gameplay loop:**
   1. Choose length (2, 3, or 5 min) and pace (4-4, 4-6, box 4-4-4-4).
   2. The lotus expands and contracts at the chosen pace. The player holds during inhale and releases during exhale.
   3. Matching the rhythm keeps the pond still and reflective. Mismatch creates gentle ripples, never punishing.
   4. At random intervals, a leaf or firefly drifts into view (a "distraction"). Tapping it once (the "noticing" action) makes it softly dissolve. It's also fine to leave it, since it drifts away.
   5. Every 5 synced breaths, a new small lotus blooms. The session ends with a still, fully bloomed pond.
5. **Controls:** *Mobile:* touch-and-hold anywhere (inhale), release (exhale), and a quick tap on distractions. *Desktop:* hold `Space`/mouse, click distractions. There's also a "just watch" mode with no input (pure guided breathing).
6. **Difficulty progression:** Deliberately gentle and non-competitive. Pace options lengthen exhale over time (the user's choice). Distractions become subtler (smaller, slower, more similar to the scene) as players return. There's an optional "count mode": count breaths silently and tap the lotus on every 10th breath, then reset, a breath-counting variant.
7. **Scoring/failure:** **No score or failure.** The results screen shows "Breaths in sync: 24/30," "Moments noticed: 5," a bloomed pond image, and a line like "Welcome back to stillness." There's no personal-best pressure (the stats aren't framed as bests).
8. **Visual/art direction:** Ultra-minimal: a dark water surface with a mirror reflection of a starry sky, a single glowing lotus (soft translucent petals, gentle inner light), subtle fog, and fireflies. Very slow ambient motion. The most "Apple Arcade calm" game in the catalog.
9. **Engine/tools:** R3F with a water surface (a planar reflector on Medium+ and a simple gradient on Low), vertex-animated lotus petals, a ripple simulation via ping-pong render target (Medium+) or procedural ripples (Low), and generative ambient audio.
10. **Sound/feedback:** A generative drone in a pleasant mode (lydian/major pentatonic), with breath cues as a soft rising tone on inhale and falling on exhale (volume optional). Blooms give soft bell tones. No harsh sounds at all. Optional voice guidance ("breathe in… breathe out…") in two voices.
11. **Accessibility:** Playable with visuals only, audio only (breath tones), or voice guidance. No time pressure. The hold input can be replaced with toggle taps. Reduced motion: lotus scale only with no ripples. High contrast gives a bright outlined lotus on black. Includes a gentle disclaimer: "If breathing exercises feel uncomfortable, breathe naturally or use Just Watch mode."
12. **Session length:** 2–5 minutes (user-selected).
13. **Feed preview:** The lotus slowly expands and contracts, ripples calm, a firefly drifts in, dissolves on a gentle tap, and a new lotus blooms. It's the calmest card in the feed, placed after intense games as a palate cleanser.
14. **Fun and replayability:** It's not "fun" in an arcade sense, but it's a deeply pleasant reset, and the blooming pond is a lovely artifact. Break reminders in the feed link here, and it's a natural ritual to end a session.

---

### 23.4 Catalog diversity check

| Interaction type | Games |
|---|---|
| Sequence reproduction (tap in order) | Echo Garden (audio-visual, musical), Lantern Lake (spatial) |
| Continuous monitoring, single response | Starback (n-back), Night Harbor (vigilance) |
| Search / select one | Glyphfield |
| Track then select | Shoal |
| Brief exposure then recall | Glimpse |
| Discrete rotation puzzle | Silhouette |
| Multiple-choice inference | Loom |
| Audio-driven selection | Rhyme Tide |
| Binary swipe decision (lexical) | Word Current |
| Binary sort with hidden rule | Prism Sort |
| Go/no-go tapping | Firefly Night |
| Directional swipe under conflict | Upstream |
| Timed single tap (anticipation) | Zenith |
| Continuous hold control | Orbit Keeper |
| Move-based planning puzzle | Stonepath |
| Rotate-to-route puzzle | Lumen |
| Rhythmic tapping (sync + self-paced) | Tidal Beat |
| Breath-paced hold, non-competitive | Still Water |

Note on overlap: Echo Garden and Lantern Lake both use "tap in order," but differ in modality (musical/auditory vs. purely spatial), layout (fixed flowers vs. organic scattered lanterns), and twists (reverse recall vs. drift/mirror trials). If playtesting shows they feel too similar, Lantern Lake's fallback redesign is a **"recall the arrangement"** variant: lanterns light simultaneously as a pattern, and the player reproduces the set in any order (pattern span rather than sequence span).

---

## 24. Development Phases

**Team assumption:** 2 full-stack/graphics engineers, 1 designer/tech artist, 1 part-time sound designer, a part-time cognitive science advisor, a part-time accessibility consultant, and a product lead (can be one of the engineers). **Estimated timeline: ~7 months to V1.**

### Phase 0 — Foundations (Weeks 1–3)

- Monorepo, CI (typecheck, lint, test, bundle budgets, license check), deploy previews.
- Design system tokens, typography, core components, and a visual identity mood board. Art direction for 3 hero palettes.
- SDK v0 spec (types from §11) and runtime state machine skeleton.
- `@utopia/audio` core (buses, unlock, synth voice), `@utopia/input`, `@utopia/difficulty` staircase.
- Game Lab route with settings panel and FPS overlay.
- Quality tier detection plus FPS governor.
- **Exit criteria:** a placeholder "hello world" game in both R3F and Pixi mounts/destroys cleanly in the Game Lab with the leak test passing.

### Phase 1 — Platform vertical slice (Weeks 4–7)

- Feed pager (virtualized, snap, gestures, keyboard) with poster/video/live preview tiers.
- Play overlay with shared-element transition, pause menu, results screen, and exact-position exit.
- Prefetch policy and module LRU cache.
- Local persistence (IndexedDB), progress, and settings screens (accessibility settings functional).
- Preview capture pipeline v1.
- **Game #1: Echo Garden** built end-to-end as the reference implementation.
- **Exit criteria:** on a Medium-tier phone, feed → Play → play → Exit → feed flows under budget. Echo Garden meets the Quality Bar.

### Phase 2 — Prototype five (Weeks 8–13)

- Build games 2–5 of the prototype set (§25) as full-quality vertical slices.
- Evolve the SDK based on real needs (version to SDK v1 at end of phase and freeze the breaking-change window).
- Build shared FX library from the extracted common effects (bloom presets, particles, water, glow).
- First external playtest (15–20 people, including 5 disabled players): tests clarity, fun, difficulty, and accessibility.
- **Exit criteria:** 5 games meet the Quality Bar. Playtest replay intent ≥ 60%. SDK v1 frozen. The go/no-go review for the scale-up confirms the architecture holds up.

### Phase 3 — Scale-up batch A (Weeks 14–19)

- Games 6–12 (7 games), ~1 game per engineer every ~1.5 weeks now that the kits are mature. The tech artist works one game ahead on art direction and assets.
- Library page, game detail pages with prerender/OG images, About/Science page.
- Optional account + sync (Supabase), data export/deletion.
- Analytics events + dashboards. Sentry.

### Phase 4 — Scale-up batch B (Weeks 20–25)

- Games 13–20 (8 games), including the content-heavy Rhyme Tide word packs if not done in Phase 2, and the Word Current lists (content pipeline plus voice recording sessions scheduled in Phase 3).
- PWA (offline, install prompt, update flow).
- Daily Seed mode across all games. Feed personalization rules. Wellbeing features (break reminders, end-of-feed card).

### Phase 5 — Polish, audit, launch (Weeks 26–29)

- Performance pass on all Low/Medium devices. Visual polish pass (lighting, transitions, micro-interactions).
- Full accessibility audit (external) plus a disabled-player playtest (round 2).
- Science copy review for all 20 games. Claims audit. Privacy review. License audit.
- Bug bash, soft launch (invite-only beta, ~200 users), metrics check, fixes, public launch.

### 24.1 Per-game production pipeline (repeatable, ~7–10 working days per game after Phase 2)

| Day(s) | Step | Owner |
|---|---|---|
| 0 | One-page game design doc from the §23 template; advisor signs off on the ability mapping | Design + advisor |
| 1–2 | Grey-box: `logic/` state machine + unit tests + ghost player; playable with primitive shapes | Engineer |
| 2 | **Fun check** — internal play; kill/iterate if not fun | Team |
| 3–5 | Art pass: models/shaders/particles; palette; high-contrast variant | Tech artist + engineer |
| 5–6 | Audio pass: SFX in-scale, music bed | Sound |
| 6–7 | Difficulty tuning with ghost simulation + internal play; tutorial; preview mode | Engineer + design |
| 7–8 | Accessibility baseline A1–A13; performance profiling on device shelf | Engineer |
| 8–9 | QA: lifecycle suite, leak test, cross-browser; copy + science note | QA / all |
| 10 | Quality Bar review → merge as `beta` (feature-flagged) | Team |

---

## 25. Build Order for the First 5 Prototypes

The first five games are chosen to **de-risk the platform** (each stresses a different engine path and SDK capability) while also giving the playtest a representative spread of abilities and energy levels.

| Order | Game | Engine | Why it's in this slot | SDK capabilities it forces us to build |
|---|---|---|---|---|
| **1** | **Echo Garden** | R3F | The signature "wow" game for the feed, with a simple core logic that lets the team focus on the platform. It's the reference implementation for every R3F game. | Full lifecycle, R3F kit (`UtopiaCanvas`, disposal, pause), postprocessing tiers, audio synth voices and buses, staircase difficulty, HUD, results, preview mode + ghost player, capture pipeline |
| **2** | **Firefly Night** | Pixi | Proves the 2D path, plus fast input and reaction-time accuracy. It's an "active" energy game to contrast with Echo Garden in playtests. | Pixi kit, precise input timestamps, trial event model, stop-signal adaptive tracking, particles in Pixi, reduced-motion handling of essential motion |
| **3** | **Tidal Beat** | Pixi + Tone.js | The highest technical risk: audio timing precision across devices and Bluetooth latency. Better to find problems in week 10 than week 24. | Audio-clock timing, latency calibration service (reused by Zenith), lazy-loaded heavy dependency, visual-only playability for an audio-centric game |
| **4** | **Stonepath** | R3F | Tests the calm puzzle archetype, including drag/discrete input, a solver-backed generator, baked lighting, and the "no time pressure" mode. Validates that the R3F kit generalizes beyond Echo Garden. | Drag + keyboard-selection input patterns, procedural generation with solver in `logic/`, baked lightmaps pipeline, reflector material tiering, undo/reset, move-optimal scoring |
| **5** | **Rhyme Tide** | Pixi + voice | Proves the content pipeline (voice recordings, audio sprites, word data) and the language-game accessibility needs, which are the most operationally different from other games. | `@utopia/content` package, audio sprite loading, Voice bus, text rendering with reading-font setting, `requiresAudio` tagging and feed filtering |

**Why not others first?** Lumen and Silhouette are great but share much of Stonepath's architecture (they're faster to build *after* it). Glimpse needs frame-accurate presentation work that benefits from Firefly Night's timing groundwork. Starback, Night Harbor, and Word Current are simpler 2D builds that are ideal for the scale-up phase.

**Prototype milestones:**

- **End of week 7**: Echo Garden complete (in Phase 1).
- **Week 9**: Firefly Night complete.
- **Week 11**: Tidal Beat complete (includes calibration service).
- **Week 12**: Stonepath complete.
- **Week 13**: Rhyme Tide complete, playtest round 1, SDK v1 freeze.

**Recommended order for games 6–20:** Zenith (reuses calibration) → Lantern Lake → Glyphfield → Starback → Silhouette → Lumen → Prism Sort → Night Harbor → Upstream → Word Current → Shoal → Glimpse → Loom → Orbit Keeper → Still Water. This interleaves engines, puts shared-architecture games next to their siblings, and leaves the most generator-heavy (Loom) and simplest-but-polish-critical (Still Water) for when the team is at peak velocity.

---

## 26. V1 Non-Goals

Explicitly **not** in V1:

1. **Multiplayer**, real-time or asynchronous.
2. **Social features**: friends, following, chat, comments, likes, public profiles, sharing to feeds (the OS share sheet for a game's URL is allowed).
3. **Global leaderboards** or any comparison with other players.
4. **Monetization**: no ads, subscriptions, in-app purchases, currencies, or paywalls.
5. **Push notifications** or email marketing.
6. **Native app store builds** (PWA only; Capacitor wrapper considered in V2).
7. **Clinical features**: assessments, diagnostic scores, norms, therapist dashboards, patient management, or HIPAA-grade data handling.
8. **Research data collection** or trial-level data upload (V2 opt-in research mode only, with ethics review).
9. **User-generated content** and **third-party game submissions** (V2).
10. **Localization** beyond English (the architecture is i18n-ready with ICU message format; the language games' content is English-only).
11. **AI-generated game content at runtime** (e.g. LLM-generated puzzles), and ML-based feed ranking.
12. **Gamepad support** (keyboard/pointer/switch-via-keyboard only).
13. **VR/AR** modes.
14. **A custom CMS**: the catalog is config-driven.
15. **Achievements/badges systems** beyond per-game personal bests and collectibles inside games (constellations, pearls, tapestries).

---

## 27. V2 Direction: Open Contribution Platform

### 27.1 Vision

Utopia becomes a **curated, open platform** where researchers, developers, designers, students, therapists, and accessibility contributors can submit **game ideas** or **complete games** for review. Accepted games join the feed with full credit to their creators.

### 27.2 Contributor types and tracks

| Contributor | Track | What they submit |
|---|---|---|
| Researchers (cognitive science, psychology) | Idea / Paradigm track | A paradigm description, target ability, citations, suggested mechanics; optional research collaboration request |
| Therapists, educators | Idea track | Needs from practice ("my clients need a game for X"), accessibility observations |
| Designers, artists | Idea / Art track | Game concepts, mockups, art direction proposals, asset packs (licensed appropriately) |
| Developers | Full game track | A complete game built on the public `@utopia/sdk` |
| Students | Idea or full game track (mentorship flag) | Course projects, hackathon games |
| Accessibility contributors | Audit track | Accessibility audits of existing games, alternative-control proposals, testing |

### 27.3 Submission and review pipeline

```
 Submit (portal) → Automated checks → Triage → Expert review → Playtest → Decision → Integration → Launch
```

1. **Submission portal** (`/contribute`): sign in (contributor account), agree to the Contributor Agreement (license grant, originality, asset license declarations), choose a track, and fill a structured template (same fields as §23 game specs).
2. **Automated checks** (full-game track):
   - Builds in the SDK sandbox, with manifest schema validation.
   - Bundle-size and asset-size budgets, plus performance run with ghost player (headless GPU) against FPS/load budgets.
   - Lifecycle test suite (pause/resume/restart/destroy, leak test).
   - License check (asset registry required), dependency license scan, and malware/security scan (no network calls outside the allowlist, no eval, CSP-compliant).
   - Automated accessibility checks (manifest completeness, color-only heuristics on sample frames, target size checks via the hit-area registry, flash analysis with a PEAT-like frame luminance test).
   - Claims linting (flags forbidden phrases per §20.1).
3. **Triage** by the Utopia team: fit with catalog diversity, quality potential.
4. **Expert review panel** (rotating volunteer + staff): **Science reviewer** (ability mapping, claims), **Accessibility reviewer** (A1–A13), **Design reviewer** (visual quality, fun, cohesion with the Utopia identity), and **Safety reviewer** (content, data, age suitability).
5. **Playtest**: beta flag for opted-in users ("Lab" section), measuring clarity, fun, early-exit rate, and difficulty fit.
6. **Decision**: Accept / Revise (with structured feedback) / Decline (with reasons).
7. **Integration**: versioned release, credits page, and contributor profile.

### 27.4 Technical foundation for third-party games

- **Sandboxed runtime:** third-party games run in a cross-origin `<iframe sandbox="allow-scripts">` served from a separate origin (e.g. `games.utopia-cdn.net`), with strict CSP. The **SDK bridge** implements `GameContext` over `postMessage`. This is why V1 requires all SDK events to be serializable and bans games from importing app internals.
- Audio in iframes: the audio unlock is forwarded from the Play tap (the iframe gets `allow="autoplay"`), and games use their own `AudioContext` inside the sandbox, with volume settings passed via the bridge.
- Preview for third-party games: video/poster only (no live iframe previews in the feed), to protect feed performance and security.
- **Public SDK package + CLI** (`npx create-utopia-game`), local Game Lab (`utopia dev`), docs site, templates for R3F and Pixi, and example games (open-sourced reference: Echo Garden-lite).
- Versioned SDK with compatibility guarantees (semver, deprecation windows).

### 27.5 V2 data model additions

```sql
create table contributors (
  id uuid primary key references profiles(id),
  roles text[] not null,                 -- researcher, developer, designer, therapist, student, a11y
  bio text, links jsonb, agreement_version text, agreed_at timestamptz
);
create table submissions (
  id uuid primary key, contributor_id uuid references contributors(id),
  track text check (track in ('idea','art','full_game','audit')),
  title text, status text check (status in
    ('draft','submitted','auto_checks','triage','in_review','playtest','revise','accepted','declined','launched')),
  target_game_id text null,              -- for audits
  created_at timestamptz, updated_at timestamptz
);
create table submission_versions (
  submission_id uuid references submissions(id), version int,
  spec jsonb,                            -- structured template fields
  bundle_url text null, auto_check_report jsonb null,
  primary key (submission_id, version)
);
create table reviews (
  id uuid primary key, submission_id uuid references submissions(id), version int,
  reviewer_id uuid references profiles(id),
  kind text check (kind in ('science','accessibility','design','safety')),
  checklist jsonb, verdict text check (verdict in ('pass','revise','fail')),
  comments text, created_at timestamptz
);
```

### 27.6 Other V2 candidates (to be prioritized by V1 data)

- Opt-in **research mode** with informed consent, ethics review (IRB partner), de-identified trial data export for approved studies.
- **Localization** (starting with Spanish, Hindi, French) including language-game content packs per language.
- Capacitor-wrapped iOS/Android apps for store discovery.
- "Collections" (curated playlists like "5-minute focus reset").
- Private, opt-in **family/educator sharing** of practice summaries (not scores vs. others).
- Gamepad and advanced switch-access support.

---

## 28. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 20 polished games is too much for a small team | High | High | Rigid per-game pipeline (§24.1), mature shared kits after Phase 2, the fun-check kill gate at day 2, and swappable backup concepts (keep 5 spare designs). If behind schedule, launch with 15 and ship the remaining 5 in a 6-week post-launch update. |
| WebGL performance on low-end Android / iOS memory eviction | High | High | One live context in the feed, video fallback, quality tiers, FPS governor, device shelf testing weekly from Phase 1 |
| Audio timing inconsistency (rhythm/timing games) | Medium | High | Tidal Beat built in the prototype phase, calibration service, audio-clock-based timing, widened windows on high-latency outputs |
| iOS Safari quirks (audio unlock, context loss, PWA limits) | High | Medium | Play tap as the universal unlock gesture, context-loss recovery in kits, iOS in the device shelf from day 1 |
| Games feel like "tests" instead of fun | Medium | High | Fun-check gate, external playtests at Phase 2 and Phase 5, design reviews against the Quality Bar, visual identity investment |
| Unsupported claims or perceived medical positioning | Medium | High | Claims policy, advisor review in the Definition of Done, forbidden-phrase lint in CI for copy files |
| Asset license issues | Low | High | License registry + CI enforcement, CC0/in-house preference, generated credits |
| Feed encourages mindless scrolling | Medium | Medium | Finite feed, scroll-without-play metric as a guardrail, break reminders, no autoplay audio |
| Accessibility gaps discovered late | Medium | Medium | Baseline A1–A13 per game from day one, consultant involvement per game, playtests with disabled players in Phases 2 and 5 |
| Bundle bloat across 20 games | Medium | Medium | Per-game budgets in CI, shared engine chunks, asset groups, lazy heavy deps |

---

## 29. V1 Definition of Done

V1 is **done** when **every** item below is true.

### 29.1 Product and content

- [ ] **20 games** are live in the feed, each passing all 10 points of the **Game Quality Bar** (§23.1), signed off by design, engineering, the science advisor, and the accessibility consultant.
- [ ] Each game has: manifest, micro-tutorial, preview mode with ghost player, captured preview video + poster, info sheet copy, science note with references, credits generated from the license registry, Daily Seed mode, and per-game settings where specified.
- [ ] About/Science page, claims policy, privacy policy, and credits page are published.
- [ ] No copy anywhere violates the claims policy (manual audit + lint pass).

### 29.2 Discovery and play flow

- [ ] Feed: snap scrolling via touch, wheel, and keyboard; live preview on the active card (tier-appropriate); video/poster tiers; finite feed with an end card and Daily Seed cycle.
- [ ] Play: tap Play → game interactive within budget (§17.2), with the shared-element transition.
- [ ] Pause/resume/restart/exit work from every state. Auto-pause on visibility/blur/orientation/context loss.
- [ ] Exit returns to the **exact card** with its preview resumed, verified by automated E2E tests for all 20 games, including after page reload mid-game.
- [ ] Results screen with personal-best comparison and game-specific stats for all 20 games.
- [ ] Library (filters by ability/energy/length/accessibility tags), game detail pages (prerendered with OG images), Progress (rings, bests, history), Settings (all §15 settings functional).

### 29.3 Platform and technical

- [ ] All 20 games run on SDK v1 with **no game-specific code in the platform** (apart from manifest config).
- [ ] The import-boundary lint passes (no game imports app internals). All game events are serializable.
- [ ] Leak test passes for all 20 games (50× mount/destroy; heap growth < 10 MB; GPU resources return to baseline).
- [ ] Performance budgets (§17.2) are met on the reference device set for all three tiers, with a recorded device test report.
- [ ] Crash-free play sessions ≥ 99.5% in the beta cohort (≥ 2 weeks, ≥ 200 users).
- [ ] PWA: installable, offline shell, previously played games playable offline, and a safe update flow (never mid-game).
- [ ] Anonymous-first local progress. Optional sign-in sync works with merge of anonymous data. Data export and deletion work (local + cloud).
- [ ] Cross-browser: latest 2 versions of Chrome, Safari (macOS + iOS), Firefox, Edge, and Samsung Internet pass the E2E suite.
- [ ] CI enforces: typecheck, lint, unit tests, E2E, bundle budgets, license check, axe checks, and the claims lint.

### 29.4 Accessibility and safety

- [ ] Platform UI meets **WCAG 2.2 AA** (external audit report with no open AA failures).
- [ ] Every game passes **Accessibility Baseline A1–A13**, with each game's accessibility profile published on its detail page.
- [ ] Photosensitivity check (frame-luminance analysis) passes for all 20 games and all previews.
- [ ] At least 2 playtest rounds with ≥ 5 disabled players each have been completed, with all blocker findings fixed.
- [ ] Break reminders, finite feed, preview audio off by default, and no dark patterns (checklist reviewed).
- [ ] Privacy: cookieless analytics by default, consent handling by region, DPAs with processors signed, and the under-13 flow is local-only.

### 29.5 Analytics and operations

- [ ] All §21.3 events are implemented, validated in a staging dashboard, and documented.
- [ ] Dashboards for discovery funnel, per-game health, retention, accessibility adoption, wellbeing guardrails, and technical health are live.
- [ ] Sentry alerts are configured for error-rate spikes per game version. There's a feature flag to disable any game instantly (kill switch).
- [ ] A runbook exists for disabling a game, rolling back a release, and responding to a claims or accessibility complaint.

---

## 30. Appendices

### Appendix A — Game design doc template (one page per game)

```
Name · Primary/secondary ability · Research paradigm inspiration (+ refs)
Core fantasy (1 sentence) · Core loop (steps) · Controls (touch / mouse / keyboard / switch)
Difficulty ladder (levels × parameters) · Adaptive rule (staircase n-up/m-down, target %)
Scoring & failure · Results stats (1–3) · Session structure
Art direction (palette tokens, references, high-contrast variant) · Engine & key tech
Sound & haptics (home key, scale, cue list) · Accessibility (A1–A13 notes, flags)
Preview script (0–8 s beat sheet) · Replayability hooks · Risks / open questions
```

### Appendix B — Glossary

| Term | Meaning |
|---|---|
| Ghost player | Scripted player driving a game's logic for previews, tests, and difficulty simulation |
| Flow band | Target success range (≈ 70–85%) that keeps play challenging but achievable |
| Staircase | Adaptive procedure that raises difficulty after n successes and lowers it after m failures |
| Quality tier | Low/Medium/High rendering profile chosen by device capability and live FPS |
| Safe play rect | The 9:16 region where all gameplay-critical content lives |
| Meaningful play session | A session with ≥ 1 completed round or ≥ 60 s active play reaching results or natural progress |
| Daily Seed | A deterministic daily variant of a game shared by all players (local bests only in V1) |

### Appendix C — Key references for science notes (advisor to verify and expand)

- Corsi, P. M. (1972). *Human memory and the medial temporal region of the brain.* (Corsi block-tapping)
- Kirchner, W. K. (1958). Age differences in short-term retention of rapidly changing information. *J. Exp. Psychol.* (n-back)
- Treisman, A., & Gelade, G. (1980). A feature-integration theory of attention. *Cognitive Psychology.* (visual search)
- Pylyshyn, Z. W., & Storm, R. W. (1988). Tracking multiple independent targets. *Spatial Vision.* (MOT)
- Ball, K., & Owsley, C. (1993). The Useful Field of View test. *J. Am. Optom. Assoc.* (UFOV)
- Shepard, R. N., & Metzler, J. (1971). Mental rotation of three-dimensional objects. *Science.*
- Raven, J. C. (1938). *Progressive Matrices.* (matrix reasoning)
- Eriksen, B. A., & Eriksen, C. W. (1974). Effects of noise letters upon the identification of a target letter. *Perception & Psychophysics.* (flanker)
- Logan, G. D., & Cowan, W. B. (1984). On the ability to inhibit thought and action. *Psychological Review.* (stop-signal)
- Robertson, I. H., et al. (1997). "Oops!": Performance correlates of everyday attentional failures (SART). *Neuropsychologia.*
- Shallice, T. (1982). Specific impairments of planning. *Phil. Trans. R. Soc. Lond. B.* (Tower of London)
- Grant, D. A., & Berg, E. (1948). A behavioral analysis of degree of reinforcement and ease of shifting to new responses (WCST). *J. Exp. Psychol.*
- Repp, B. H. (2005). Sensorimotor synchronization: A review of the tapping literature. *Psychonomic Bulletin & Review.*
- Simons, D. J., et al. (2016). Do "brain-training" programs work? *Psychological Science in the Public Interest.* (balanced evidence on transfer; informs our claims policy)

### Appendix D — Open questions (to resolve in Phase 0–1)

1. Final product name and trademark check for "Utopia."
2. Region-specific analytics consent defaults (EU/UK opt-in vs. elsewhere).
3. Voice talent: accent choice(s) for English language games (e.g. neutral US + UK option?).
4. Whether to include a lightweight "Collections" row in Library for V1 (low cost, may aid discovery).
5. Whether Daily Seed results should be shareable as an image (no social graph, OS share sheet only). Recommended yes if cheap.

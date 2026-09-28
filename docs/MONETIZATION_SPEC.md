# Gamification + Rewarded-Ads Spec (v1)

Status: approved by owner, ready to implement. **Budget is tight: implement directly, no subagents, and keep
screenshot/verification rounds minimal** (one smoke run + a few targeted screenshots at the end).

## Decisions (owner-approved)
- **Rewarded ads only, always opt-in.** Never forced, never before a game, never gating a game or accessibility.
  Hard cap: 12 rewarded ads per day (device-local).
- **Mock ad provider now**, behind an interface; real provider later (Google H5 Games Ads `adBreak({type:'reward'})`).
- Build all four: **Orbs + cosmetic shop**, **Second chance on loss**, **Superpower boosts**, **XP, levels & daily quests**.
- Update **app copy only** ("0 ads, ever" → "No forced ads, only optional rewards"). Don't touch videos/posts.
- Keep the PRD's principles: no streak-loss guilt, no dark patterns, honest scores (boosted/revived runs are
  tracked separately and never overwrite normal personal bests).

## Codebase orientation (read these first, nothing else needed)
- `src/sdk/types.ts`: GameContext/GameInstance contract. `src/runtime/host.ts`: builds ctx, pause/resume.
- `src/app/components/PlayOverlay.tsx`: play lifecycle (how-to card → playing → results), `finish()` saves progress.
- `src/platform/progress.ts` (zustand persist), `src/platform/settings.ts`, `src/platform/analytics.ts` (`track`).
- Editorial UI kit: `src/app/components/Editorial.tsx` (Hero, SectionHead, CountUp, AbilityIcon), CSS in
  `src/styles/editorial.css`; pages in `src/app/pages/*`; global tokens in `src/styles/global.css`.
- Tests: `npx tsc --noEmit`, `npx vitest run`, `node scripts/smoke.mjs <id>`, `node scripts/app-smoke.mjs`
  (dev server on :5173 via `npx vite --port 5173`).

## 1. Economy store: `src/platform/economy.ts` (zustand + persist, key `utopia.economy`)
State: `orbs`, `xp`, `owned: string[]` (cosmetic ids), `equipped: { skin: string; theme: string }`,
`boosts: { slowmo: number; secondWind: number }` (inventory), `quests: { day: string; list: Quest[] }`,
`ads: { day: string; count: number }`.
- `levelFor(xp) = floor(sqrt(xp / 60)) + 1`; `xpForLevel(l) = 60*(l-1)^2`. Expose `level`, progress to next.
- `award({ orbs, xp })`, `spend(orbs): boolean`, `canWatchAd()`, `noteAd()`.
- Session rewards (called from PlayOverlay.finish): `orbs = 8 + min(30, levelReached*3) + (completed ? 5 : 0)`,
  `xp = 25 + levelReached*6 + round(minutes*10)`. Assisted runs: 50% orbs, full XP.
- **Daily quests**: 3 per UTC day, deterministic from `hashString(day)` (from `@/sdk/rng`). Templates:
  play 2 sessions in ability family X (use `ABILITY_RING`); try N=3 different games; reach level ≥ L in any game;
  finish a calm-family game; beat one of your personal bests. Reward 20–40 orbs + 50 XP. Progress updates in
  `finish()`; completed quests show a **Claim** button (no auto-expiry pressure, no "streak lost" messaging).
- Unit tests `src/platform/economy.test.ts`: level math, quest determinism per day, spend guard, ad cap.

## 2. Ads: `src/platform/ads.ts`
```ts
export type AdResult = 'rewarded' | 'dismissed' | 'unavailable';
export interface AdProvider { showRewarded(placement: 'double-orbs' | 'second-chance' | 'boost' | 'shop'): Promise<AdResult> }
```
- `MockAdProvider`: renders a React modal via a tiny zustand store + `<AdHost/>` mounted in `App.tsx`:
  glass card, "Sponsored · Mock ad" label, an animated brand-style placeholder, 5s countdown, then
  "Collect reward" (rewarded) or "Close" early (dismissed). Accessible (role=dialog, focus trap, Esc = dismiss).
- `H5AdProvider` stub (not active): documents `adBreak({ type: 'reward', beforeReward, adViewed, adDismissed,
  adBreakDone })` and returns 'unavailable' if `window.adBreak` is missing. Select provider via
  `import.meta.env.VITE_ADS_PROVIDER` (default 'mock').
- Always check `canWatchAd()`; on cap reached show "Daily ad limit reached" and offer the orb alternative.
- Pause the game (host.pause) during any ad; audio already suspends on pause.
- Track: `ad_request`, `ad_result` (placement, result) via `track` (extend the union in analytics.ts).

## 3. Second chance (revive): SDK addition
- `GameContext.revive(): Promise<boolean>`: game calls it when it would end due to lives/shields/misses.
  Runtime (host option `onRevive`) pauses, the platform shows a sheet: "Keep going?" with **Watch ad** or
  **Use Second Wind (inventory)** or **No thanks**. Max **1 revive per session**. Returns true if granted;
  host resumes. In preview mode it always resolves false immediately.
- Implement in the lives-based games (each a ~5-line change where lives hit 0):
  `echo-garden` (lives), `lantern-lake` (misses), `zenith` (misses), `orbit-keeper` (shields),
  `firefly-night` has no lives (skip). Grant = restore 1 life/shield/miss.
- Revived session ⇒ `assisted = true`.

## 4. Superpower boosts (generic, no per-game work)
Chosen on the pre-game card (the how-to card in PlayOverlay, and a compact "Boost this run" row shown before
`begin()` on every play, dismissible, remembered off via a setting "Show boost picker"):
- **Slow-mo**: this run's `timingMultiplier` × 1.5 (apply in host by wrapping settings for that host only).
  Cost: 1 from inventory, or 40 orbs, or a rewarded ad.
- **Second Wind**: pre-loads a free revive (skips the ad in §3). Cost: inventory, 60 orbs, or an ad.
- Any boost ⇒ `assisted = true`. Hide boosts for `still-water` (showScore false).

## 5. Honest scores
- `SessionRecord` + `GameProgress`: add `assisted?: boolean`, `bestAssisted: number`. In `finish()`, assisted runs
  update `bestAssisted` only. Results screen shows a small "Boosted run" pill and compares to `bestAssisted`.

## 6. Results screen additions (PlayOverlay `Results`)
- Reward row: "+N orbs · +M XP" (CountUp), level-up burst if level changed, quest-complete chips.
- **Watch ad to double orbs** button (once per results screen, secondary style, never pre-selected/autofocused;
  "Play again" stays the primary action).

## 7. Shop + profile
- Route `/shop` (lazy page, editorial Hero "Make it *shine.*") linked from a **wallet pill** (orb glyph + count)
  shown on Progress hero and the results screen. Nav stays 4 tabs.
- Cosmetics (price in orbs; some also unlockable by 1 rewarded ad = "free sample" once each):
  - **Orb skins** (brand orb in nav/`.brand-orb`, Progress profile card): Aurora (default, owned), Sunrise,
    Lagoon, Ember, Frost, Nebula. Each = CSS gradient vars.
  - **Themes** (`document.documentElement.dataset.theme`): Aurora (default), Dusk, Ocean, Forest, Mono.
    Each overrides `--accent` and the editorial aurora defaults `--a1..--a3` (see editorial.css `.ab-hero`).
    High-contrast mode always wins over themes.
  - **Boost packs**: 3× Slow-mo (100 orbs), 3× Second Wind (150 orbs).
- Progress page: new top "Profile" card: equipped orb, level ring + XP bar, orbs, and the 3 daily quests
  (Claim buttons). Keep existing sections below.

## 8. Copy updates (app only)
- About: stat "0 ads, ever" → "0 forced ads"; principle "Respectful of your attention" → mention ads are optional
  and rewarded only; "Utopia isn't" list unchanged. Search `src/` for "No ads" / "no ads" / "ads, ever" and fix.
- Settings → new group "Rewards": toggle "Show boost picker before games", info row "Ads are optional and only
  shown when you choose a reward" + today's ad count.

## Acceptance
- tsc clean, vitest green (incl. economy tests), `node scripts/smoke.mjs echo-garden,zenith,orbit-keeper,lantern-lake`
  OK, `node scripts/app-smoke.mjs` OK. Manually verify: finish a session → orbs/XP shown → double via mock ad;
  lose in Echo Garden → revive sheet works once; buy + equip a theme and orb skin; claim a quest.
- Commit with a clear message; push.

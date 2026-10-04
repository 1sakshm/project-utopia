# Project Utopia: Hardening PRD ("make it top class")

Status: draft · Owner: Saksham Sharma · Scope: everything between "it works" and "it is excellent".

This document is a blunt audit plus a fix plan. Each item says **what is wrong, how we know, the ideal fix,
and how we will know it is done.** Evidence tags:

- **[measured]**: checked directly in the code, build output, or live site while writing this.
- **[judgment]**: my assessment from the structure of the project; needs validation before we spend time on it.
- **[unknown]**: we have never tested this, so we do not know.

Where I could not measure something, the fix is to *measure it first*.

---

## 0. The honest summary

Utopia is a genuinely well-crafted product for something built this fast: 30 games on one SDK, real accessibility
settings, working voice games, a PWA, analytics, and a rewards system. The weak spots are not in the ideas. They
are in the **things nobody sees until they break**:

1. **It is heavy for its audience.** The service worker downloads ~4.6 MB on first visit and the 3D engine alone is
   985 KB. The target users are on mid-range Android phones on mobile data. [measured]
2. **Almost nothing guards against regressions.** 3 test files, no linter, no CI, no formatter. The 38,000 lines of
   code are held together by a few smoke scripts and care. [measured]
3. **The voice endpoint is a spendable liability.** Its only protection is an `Origin` check, which any script can
   fake, and there is no rate limit or spend cap. If this goes viral or someone is hostile, the Sarvam bill is
   uncapped. [measured]
4. **No privacy policy exists**, yet the app records a microphone, sends it to a third party, and runs analytics. [measured]
5. **The live site shows fake ads.** Players are asked to watch a placeholder "Mock ad" for real in-app rewards. [measured]
6. **Accessibility is the brand promise and has never been audited by a tool or a real assistive-technology user.** [measured: no axe/screen-reader tests exist]
7. **Two deployments (Vercel and Cloudflare) can silently drift**, because only one deploys automatically. [measured]

None of this is hard. All of it is unglamorous. Fixing it is what separates a demo from a product people trust.

---

## 1. Priorities and phases

| Phase | Theme | Items | Rough effort |
|---|---|---|---|
| **P0: Trust & safety** (do first) | Things that can hurt users or your bill | H1–H6 | 3–5 days |
| **P1: Quality foundation** | Make change safe and the app fast | Q1–Q7 | 1.5–2 weeks |
| **P2: Product excellence** | Retention, polish, reach | X1–X8 | ongoing |

Rule: nothing in P2 ships before P0 is done. Voice games plus a mic plus no policy is a liability, not a feature.

---

## 2. P0: Trust & safety

### H1. Abuse protection for `/api/tts` and `/api/stt`
- **Problem.** The only guard is an `Origin`/`Referer` host match (`api/_sarvam.ts`). Anyone can send a forged header
  with `curl`. There is no per-IP rate limit, no daily budget, and STT responses are never cached. A loop of requests
  drains your Sarvam credits. [measured]
- **Ideal fix.**
  1. Per-IP rate limits on both endpoints (Cloudflare Rate Limiting rules, or a KV counter; Vercel equivalent for the backup).
  2. A **hard daily spend ceiling** in code: count calls per day in KV and return `429` past a threshold. Also set the cap in the Sarvam dashboard.
  3. Add Cloudflare **Turnstile** (invisible) or a short-lived signed session token issued by the app on load, required on every API call. This raises the bar from "copy a header" to "run a real browser."
  4. Tighten limits: STT max audio length and file size; TTS text max 200 chars already exists.
  5. Log rejected requests (count only, no content) to spot abuse.
- **Done when.** A scripted loop of 1,000 requests from one IP gets blocked after the limit; a request with a forged `Origin` and no token is rejected; a daily-cap test returns 429; the dashboard cap is set.
- **Effort.** 1–2 days.

### H2. Privacy policy, terms, and consent that match reality
- **Problem.** There is no privacy or terms page (routes: feed, library, progress, settings, about, shop, game, play,
  lab). The app records microphone audio, sends it to Sarvam, and sends anonymous events to PostHog. The consent sheet
  mentions Sarvam but there is nothing to link to. [measured]
- **Ideal fix.**
  1. Add `/privacy` and `/terms` pages, in plain language, linked from About, Settings, the voice consent sheet, and the footer.
  2. Cover: what is stored on the device, what analytics are sent, what happens to voice audio (sent to Sarvam for transcription; Utopia does not store it; state Sarvam's own retention honestly after reading their terms), how to delete everything, contact email.
  3. **Analytics consent by region.** Anonymous IDs in local storage can require consent under EU/UK rules. Either (a) default analytics *off* for EU/UK visitors and show a one-time notice, or (b) get a real legal opinion. I am not a lawyer; decide this deliberately.
  4. Add a "Delete my voice/analytics identity" button (resets the PostHog ID, not only local progress).
- **Done when.** Both pages exist and are linked from the four places above; the voice sheet links to the policy; a lawyer or a trusted advisor has read it once.
- **Effort.** 1 day writing, plus review.

### H3. Security headers and CSP
- **Problem.** The live Cloudflare site sends only `referrer-policy` and `x-content-type-options`. There is no
  Content-Security-Policy, no clickjacking protection, no Permissions-Policy (the mic is a sensitive permission), and
  no HSTS. [measured]
- **Ideal fix.** Add `public/_headers` (Cloudflare) and matching `vercel.json` headers:
  `Content-Security-Policy` (default-src 'self'; connect-src 'self' + PostHog host; img/font/style/script narrowed; no inline scripts if possible),
  `frame-ancestors 'none'`, `Permissions-Policy: microphone=(self), camera=(), geolocation=()`, `Strict-Transport-Security`, `Cross-Origin-Opener-Policy`.
  Roll out CSP in report-only mode first, fix violations, then enforce.
- **Done when.** securityheaders.com scores A or better; the full e2e suite passes under the enforced CSP; ad scripts (when added) are explicitly allow-listed.
- **Effort.** 0.5–1 day.

### H4. Honest ads: stop showing a fake ad to real players
- **Problem.** Production builds show a "Sponsored · Mock ad" 5-second placeholder and pay out real in-app rewards for it.
  That is a test fixture presented as a feature, and it teaches players to expect ads that do not exist. [measured]
- **Ideal fix.**
  1. Add an ads mode flag: `VITE_ADS_PROVIDER = off | mock | h5`. **Production default is `off`**: every "watch an ad" button is hidden, and orbs are earned by playing only. `mock` stays available for local/testing.
  2. Second chance and boost flows fall back gracefully to orbs and inventory only when ads are off.
  3. Flip to `h5` only after Google H5 Games Ads approves the site and the real script is installed and tested on a real device.
- **Done when.** Live site shows zero ad UI; e2e passes in both `off` and `mock` modes; switching to `h5` requires only an env change.
- **Effort.** 0.5 day.

### H5. Error boundaries and resilient storage
- **Problem.** No React error boundary exists; a render error in a page or component blanks the whole app. Game
  errors are caught by the host, but nothing else is. Persisted state (progress, economy, settings) uses plain
  localStorage with no explicit handling for quota errors, blocked storage (private mode), or corrupted JSON, so a
  bad write can silently lose a player's orbs and progress. [measured: no `ErrorBoundary`/`componentDidCatch`; no storage try/catch found]
- **Ideal fix.**
  1. Top-level and per-route error boundaries with a friendly recovery card ("Reload", "Reset this page's data") and error reporting (count and message only) to analytics.
  2. A storage wrapper: try/catch on read/write, in-memory fallback if storage is blocked, a visible "progress can't be saved in this mode" notice, and safe recovery from corrupted JSON (back up the bad blob to a second key, then start clean).
  3. **Import** to match the existing **Export**: restoring progress, settings and economy from a JSON file. Include a schema version and migrations for every persisted store.
  4. Ask the browser for persistent storage (`navigator.storage.persist()`) after the first meaningful session.
- **Done when.** Forced render throw shows the recovery card, not a blank page; tests cover corrupted, missing and over-quota storage; export → clear → import round-trips exactly.
- **Effort.** 1–1.5 days.

### H6. One deployment source of truth
- **Problem.** Vercel redeploys on every push; Cloudflare only when someone runs `npm run deploy:cf`. The two sites
  can show different versions, and the voice-function code exists in two wrappers (`api/` and `functions/api/`). [measured]
- **Ideal fix.** A GitHub Actions workflow on push to `main`: install → typecheck → lint → unit tests → build → deploy
  to Cloudflare (primary) → smoke-test the deployed URL (home 200, `/api/tts` probe, one TTS round-trip). Vercel
  stays as a backup fed by the same commit. Pin the API handler logic in one place (`api/_sarvam.ts`), with the two
  wrappers as thin adapters covered by a test.
- **Done when.** A push to `main` updates both sites within minutes, and a failing test blocks the deploy.
- **Effort.** 0.5–1 day (needs Cloudflare API token stored as a GitHub secret).

---

## 3. P1: Quality foundation

### Q1. Performance on real phones (the biggest product risk)
- **Problem.**
  - JS chunks: `engine-r3f` 985 KB, `engine-pixi` 545 KB, main `index` 345 KB, `module` 282 KB (raw, before gzip). [measured]
  - The service worker **precaches 132 entries / 4.6 MB** on the first visit. On mobile data that is a heavy,
    unrequested download, and it competes with the game the player actually opened. [measured]
  - Posters total 1.1 MB (30 JPEGs). [measured]
  - All performance testing so far ran on a software renderer (SwiftShader) in a desktop browser. **We have no data
    from a real ₹8,000–15,000 Android phone.** [unknown]
- **Ideal fix.**
  1. **Precache only the app shell** (HTML, main JS, CSS, fonts, icons). Runtime-cache engine chunks and each game **when first played** (stale-while-revalidate). Optionally add a "Download for offline" button in Settings.
  2. Convert posters to AVIF/WebP with `srcset`, lazy-load below the fold; target < 400 KB total.
  3. Enforce **bundle budgets in CI**: main entry ≤ 150 KB gz, each game chunk ≤ 60 KB gz, fail the build on regression (`size-limit` or a script).
  4. Audit what is in `index` (345 KB): PostHog is lazy already; check that GSAP, the shop/economy, and unused engine code are not in the entry chunk.
  5. **Field data.** Add `web-vitals` (LCP, INP, CLS) reported to PostHog with device class and connection type. Test manually on 2–3 real low-end Android devices and one iPhone.
  6. Cap concurrent live previews in the feed and pause offscreen ones (verify this holds under load); add a "battery/data saver" auto-mode when `saveData` or low memory is detected.
- **Done when.** First-visit transfer ≤ 1.5 MB before any game is opened; feed interactive < 3 s on a mid-range Android over 4G; INP p75 < 200 ms in the field data; budgets enforced in CI.
- **Effort.** 3–5 days, plus device testing.

### Q2. Automated testing that actually protects the games
- **Problem.** 3 test files / 20 unit tests cover the economy, speech matching and a few helpers. Every game is
  verified only by a 5–9 second smoke run that **never reaches a game-over**, so the win/loss/revive paths,
  scoring, difficulty, and results screens are essentially untested. [measured]
- **Ideal fix.**
  1. **Separate pure game logic from rendering** in each game (`logic.ts`: rules, scoring, difficulty steps; `game.tsx`: drawing). Logic becomes unit-testable with the seeded RNG.
  2. A **deterministic "ghost player"** e2e harness: run each game with a fixed seed, let a scripted player lose on purpose and win on purpose, and assert the results screen, the score range, the revive offer, and no console errors. The DEV test hooks added for rewards are the starting point.
  3. Coverage gate in CI for `src/platform`, `src/sdk`, `src/runtime` (target ≥ 80%); logic files for games (target ≥ 70%).
  4. Visual regression screenshots for the 6 key screens (feed, howto, results, shop, progress, settings) on mobile and desktop, to catch layout regressions.
  5. Convert the ad-hoc `scripts/*.mjs` into one Playwright test suite with proper retries, run in CI.
- **Done when.** Every game has a scripted lose-and-win test; CI blocks merges that fail; coverage numbers are published in the README.
- **Effort.** 1–2 weeks (logic extraction is the long part; start with the 6 most-played games).

### Q3. Lint, format, types, and CI
- **Problem.** No ESLint, Prettier, `.editorconfig`, or CI workflow exist. There are already `eslint-disable`
  comments for a rule set that is not installed. Line endings (CRLF vs LF) trigger warnings on every commit. Single
  files exceed 1,000 lines (`stonepath` 1,249; `zenith` 1,175; `still-water` 1,135). [measured]
- **Ideal fix.** ESLint (typescript-eslint + react-hooks + jsx-a11y), Prettier, `.editorconfig`, `.gitattributes` with `* text=auto eol=lf`, a pre-commit hook (lint-staged), and a CI job for lint + typecheck + tests + build. Add a file-size guideline (soft limit ~500 lines, split by concern) and split the largest games.
- **Done when.** `npm run lint` is clean, CI is green on every PR, and no commit produces CRLF warnings.
- **Effort.** 1 day setup, then incremental cleanup.

### Q4. Accessibility audit (this is the brand)
- **Problem.** The app has strong *settings* (contrast, motion, timing, captions, fonts) but has never been checked by
  an automated tool or a real assistive-technology user. Modal dialogs (`aria-modal`) do not trap focus. Canvas games
  are the hardest part: it is unclear whether a screen-reader user can play or even understand them. Touch-target sizes
  and focus order are unverified. [measured: no axe tests; judgment on canvas parity]
- **Ideal fix.**
  1. Add `axe-core` to the Playwright suite for every page and dialog; fix all serious/critical findings.
  2. **Focus management:** trap and restore focus in `PlayOverlay`, `AdHost`, the revive sheet, the voice consent sheet, and confirm dialogs; `Esc` behavior consistent everywhere.
  3. Manual passes with **NVDA + Chrome, VoiceOver + Safari (iOS), TalkBack + Chrome (Android)** on the feed, a game, and results. Document what is and is not playable by screen reader, per game, in an "Accessibility" table, and mark each game honestly (fully / partly / visual-only).
  4. Ensure every interactive element ≥ 44×44 px, color is never the only signal, `prefers-reduced-motion` and `prefers-contrast` are honored on first load (not only via settings).
  5. Publish an **accessibility statement** page with known gaps and a contact address.
  6. Recruit 3–5 users with different needs (low vision, motor, dyslexia, deaf/HoH) for a short paid usability session.
- **Done when.** Zero serious/critical axe violations; every dialog passes a keyboard-only test; the statement is live and lists real gaps; at least three real users have played.
- **Effort.** 1 week + user sessions.

### Q5. Voice reliability across real devices
- **Problem.** Voice tests ran in headless Chromium with synthetic audio. The microphone path is untested on real
  iOS Safari and Android Chrome, where recording formats, permissions, and autoplay rules differ. STT is uncached and
  its latency and failure modes are not surfaced well. Only English and Hindi are supported. [unknown for real devices; measured for languages]
- **Ideal fix.**
  1. Real-device test matrix (iPhone Safari, Android Chrome, desktop Chrome/Firefox): permission denied, permission granted then revoked, tab hidden mid-recording, slow network, offline.
  2. Clear timeouts and retry UI ("Didn't catch that. Try again or type"), with a visible listening state and level meter.
  3. If the API is unreachable or over quota, degrade automatically to typed answers and device speech, and say so once.
  4. Measure STT latency and success rate in analytics (numbers only) to tune prompts and thresholds.
  5. Prepare the language layer for expansion (see X5).
- **Done when.** The matrix passes on real devices; every failure mode shows a recoverable UI; latency p75 is tracked.
- **Effort.** 3–4 days plus devices.

### Q6. Repo hygiene and supply chain
- **Problem.** The `.git` folder is ~50 MB because marketing videos and images were committed earlier
  (`marketing/out/*.mp4` 22 MB and 15 MB, plus PNGs) and remain in history even though the files were moved out.
  The repo is public. Dependencies are at the bleeding edge (TypeScript 7, Vite 8, Vitest 5). Docs still say "20 games"
  (README, PRD). `video.mp4` sits untracked in the project folder. [measured]
- **Ideal fix.** Rewrite history once with `git filter-repo` to drop `marketing/` (coordinate with anyone who cloned; it is a solo repo so it is safe), add `marketing/`, `*.mp4` and `shots/` to `.gitignore`, enable Dependabot/Renovate with grouped weekly updates, add `npm audit` to CI, publish a `THIRD_PARTY_NOTICES.md` (fonts, libraries, any downloaded 3D assets, with licenses), and update README/PRD to the real game count, or generate the count from the registry so it cannot go stale.
- **Done when.** Fresh clone < 10 MB; docs match reality; CI reports vulnerabilities; license notice exists.
- **Effort.** 0.5–1 day.

### Q7. Observability
- **Problem.** There are 16 analytics events but no defined dashboards, funnels, or alerts, so "is it working" is
  answered by hand. There is no client error reporting and no uptime check. [measured for events; judgment for gaps]
- **Ideal fix.**
  1. Define the **north-star and funnel** in PostHog and save them: visit → first game started → first game completed → second game → returns day 1 / day 7. Publish the definitions in `docs/ANALYTICS.md`.
  2. Add `client_error` (message + route, no PII), `web_vitals`, `voice_failure` (type only) events.
  3. Uptime monitor on `/` and `/api/tts?probe=1` (free tier of an uptime service) with an email alert.
  4. A weekly automated summary (or a manual checklist) reviewing retention, crash rate, and per-game completion.
- **Done when.** One dashboard answers "how many people came back this week, and which games do they finish."
- **Effort.** 1–2 days.

---

## 4. P2: Product excellence

### X1. The first 60 seconds (activation)
- **Problem.** We have never watched a stranger use it. [unknown] The feed is the whole hook, but there is no data on how many
  new visitors start a game, or where they stop.
- **Ideal fix.** Run 8–10 moderated sessions with people outside your circle (screen-share, no coaching). Instrument
  time-to-first-game and first-game completion. Iterate on: what a new visitor sees first, the how-to card length, the
  difficulty of the first game shown, and a "why is this good for me" line. Target the top 3 drop-off points.
- **Done when.** ≥ 60% of first-time visitors start a game and ≥ 40% finish one (targets to validate, not promises).

### X2. Game quality bar and curation
- **Problem.** 30 games at speed means uneven quality; some are likely near-duplicates in feel, and difficulty tuning
  is unvalidated with real players. [judgment]
- **Ideal fix.** A written **quality rubric** (clarity in 5 seconds, feel, difficulty curve, accessibility, replay
  reason). Score every game 1–5, using play-through data (completion rate, early-exit rate, replay rate, from analytics).
  Fix or retire the bottom quartile *before* adding more. For the 1,000-game ambition, quality gates matter more than count.
- **Done when.** Every game has a score and an owner-approved decision (keep / fix / retire).

### X3. A retention loop that respects the brand
- **Problem.** Retention rests on quests and cosmetics only. There is no reason to return tomorrow beyond a small
  reward, and no shareable moment. [judgment]
- **Ideal fix.** A **daily challenge** everyone plays (the seeded daily mode exists; surface it as the front door),
  a shareable **result card** (image + link, no scores against strangers unless opt-in), an opt-in reminder (web push,
  off by default), and a weekly "your week in practice" recap. Keep the no-streak-guilt promise.
- **Done when.** Day-7 return rate is tracked and improving release over release.

### X4. Economy tuning
- **Problem.** Starting orbs (50), rewards, and prices were chosen by feel. There is no data on how fast players earn
  versus spend, so the shop may feel empty or trivial. [judgment]
- **Ideal fix.** Model earn/spend per session; instrument `reward` and `shop_purchase` (already present); review after two weeks of data. Add a few aspirational items rather than more sinks. Keep every item cosmetic or convenience.
- **Done when.** Median player can afford a first item in ~3 sessions and a mid-tier item in ~10.

### X5. Localization
- **Problem.** All UI text is hard-coded English and there is no i18n layer, although voice is Hindi-capable and the
  strategy is Indian-language expansion. Every new string makes this harder. [measured: no i18n]
- **Ideal fix.** Introduce a light i18n layer now (message catalog, `t()`, plural/number formatting), extract UI strings,
  ship Hindi UI first, and make game content language-aware (word lists, prompts) via data files, not code. Use
  Sarvam Translation for drafts and a native speaker to review.
- **Done when.** The whole UI can be switched to Hindi with no untranslated strings; a third language is a data-only change.

### X6. Discoverability and sharing
- **Problem.** The app has one generic meta description and **no Open Graph or Twitter card image**, so links shared on
  LinkedIn, X or WhatsApp look bland. The SPA has no per-game pages a search engine or a link preview can read. [measured]
- **Ideal fix.** Add `og:title/description/image` and Twitter cards; prerender a static page per game (title, poster,
  description) with proper meta; add `sitemap.xml`, `robots.txt`, structured data; make a `/game/:id` share link
  that unfurls with the game's poster.
- **Done when.** A pasted link shows a rich preview on LinkedIn, X and WhatsApp for the home page and any game.

### X7. Code architecture for scale (1,000 games)
- **Problem.** Games are large single files mixing logic and rendering; patterns like lives, results, and countdowns
  are re-implemented per game; the entry bundle already carries a 30-game registry. [measured for file sizes; judgment for duplication]
- **Ideal fix.** Extract shared building blocks into the SDK (lives system, round/trial loop, result reporting,
  input abstractions, voice prompt loop); make the registry manifest-only and lazy (metadata separate from code);
  provide a `create-game` generator script and template; validate manifests with a schema at build time.
- **Done when.** A new simple game is < 250 lines, generated from a template, and passes the ghost-player test automatically.

### X8. Security hardening of the economy
- **Problem.** Orbs and unlocks live in localStorage, so anyone can edit them. That is fine while everything is
  cosmetic and free. It stops being fine the moment currency has real value (paid IAP, real prizes, leaderboards). [measured]
- **Ideal fix.** Keep it local-first for now and *say so*. If leaderboards or purchases are ever added, move the ledger
  server-side with signed events and rate limits. Do not add real-money features before that exists.
- **Done when.** Decision recorded: "cosmetic only, local, not tamper-proof" (today) vs. server ledger (before any money).

---

## 5. Additional items to verify (may be fine, never checked)

- `/lab` (the developer game viewer) renders in production for anyone who types the URL. Decide: gate behind DEV or keep as a public "playground" on purpose. [measured: no DEV guard in `App.tsx`]
- PWA install prompt behavior on iOS (no `beforeinstallprompt`); add an instructional hint. [unknown]
- Service-worker update while the Cloudflare and Vercel sites both exist on different origins: players installed from one origin will not receive the other's updates. Pick one canonical origin and redirect the other. [judgment]
- Keyboard-only and switch-access play for each game. [unknown]
- Memory leaks over long sessions (30+ minutes of feed browsing, repeated game restarts) on low-RAM phones. [unknown]
- Time-zone and day-boundary behavior for daily seeds and quests (UTC vs local). Players in India roll over at 5:30 AM. Consider local-midnight rollover. [judgment]

---

## 6. Success metrics (what "top class" means, measurably)

| Area | Metric | Target |
|---|---|---|
| Speed | First-visit transfer before play | ≤ 1.5 MB |
| Speed | Feed interactive, mid-range Android 4G | < 3 s |
| Speed | INP p75 (field) | < 200 ms |
| Reliability | Unhandled client errors per 1,000 sessions | < 2 |
| Reliability | Uptime (site + voice API) | ≥ 99.5% |
| Quality | Games with scripted win/lose tests | 100% |
| Quality | CI green required to deploy | Yes |
| Accessibility | axe serious/critical violations | 0 |
| Accessibility | Real AT users who have played | ≥ 3 |
| Trust | Privacy policy + terms + accessibility statement live | Yes |
| Cost safety | Daily Sarvam spend ceiling enforced | Yes |
| Growth | First-visit → first game completed | ≥ 40% (to validate) |
| Growth | Day-7 return | tracked, improving |

---

## 7. Suggested order of work

1. **Week 1 (P0):** H4 (ads off in prod), H1 (rate limit + spend cap + token), H3 (headers/CSP report-only), H2 (privacy/terms), H5 (error boundary + storage), H6 (CI + auto-deploy).
2. **Weeks 2–3 (P1):** Q3 (lint/CI/format) → Q1 (precache diet, budgets, web-vitals, real-device test) → Q6 (repo cleanup) → Q7 (dashboard).
3. **Weeks 3–5 (P1):** Q2 (logic extraction + ghost-player tests, top 6 games first) → Q4 (axe + AT sessions) → Q5 (real-device voice).
4. **Ongoing (P2):** X1 user sessions → X2 quality rubric → X6 sharing → X3 retention → X5 i18n → X7 architecture → X4 economy tuning.

## 8. Out of scope (deliberately)

- Real-money purchases, paid subscriptions, or leaderboards with prizes (would require X8 first).
- User accounts and cloud sync (revisit after export/import proves the need).
- Native iOS/Android apps (the PWA is the product until retention data says otherwise).
- Medical or clinical claims about the games. Copy must stay at "designed around" abilities, never "treats" or "improves" a condition, and any science claims need a reviewed source.

## 9. Open decisions for the owner

1. Is analytics default-on acceptable for EU/UK visitors, or do we ship region-aware consent (H2)?
2. Which single origin is canonical: Cloudflare (`playutopia.pages.dev`) or a custom domain later?
3. Do we keep `/lab` public?
4. Are we willing to rewrite git history (Q6)? Safe for a solo repo, but it changes every commit hash.
5. Do we recruit paid accessibility testers (Q4), and what is the budget?

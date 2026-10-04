# Project Utopia: YC plan, retention research and monetization

Last updated: 5 October 2026. Every external fact links to its source. Where a number is a vendor estimate it
says so; where no number exists it says "unknown". Nothing here is a promise of results.

**Contents**
1. [The deadline and the next 4 weeks](#1-the-deadline-and-the-next-4-weeks)
2. [Retention research](#2-retention-research-what-keeps-people-coming-back)
3. [What changed in the product because of it](#3-what-changed-in-the-product-because-of-the-research)
4. [Monetization research and plan](#4-monetization)
5. [Market and competitors](#5-market-and-competitors)
6. [How to talk about the science (claims that won't get you in trouble)](#6-claims-safety)
7. [YC: how it works and what they look for](#7-yc-how-it-works-and-what-they-look-for)
8. [Draft YC application answers](#8-draft-yc-application-answers)
9. [Metrics to track (PostHog setup)](#9-metrics-to-track)
10. [Roadmap after the application](#10-roadmap)

---

## 1. The deadline and the next 4 weeks

- **YC Winter 2027 applications close Nov 2, 2026 at 8pm PT** (that is **Nov 3, 8:30am IST**). On-time applicants hear
  back by **Dec 11**; interviews are mostly by video in Nov–Dec; the batch runs Jan–Mar 2027 in San Francisco
  ([YC Apply](https://www.ycombinator.com/apply)).
- Late applications are considered but with no promised timeline ([YC Apply](https://www.ycombinator.com/apply)). **Apply on time.**
- If you're still a student and want to finish first: YC **Early Decision** lets you apply now and join a later batch
  after graduating ([YC Early Decision](https://ycombinator.com/early-decision), [TechCrunch](https://techcrunch.com/2025/09/24/y-combinator-launches-early-decision-for-students-who-want-to-graduate-first-build-later/)).
- The deal: $500K total ($125K for 7% + $375K uncapped MFN SAFE) ([YC Deal](https://ycombinator.com/deal)).

### Week-by-week until submission

| Week | Dates | Do |
|---|---|---|
| 1 | Oct 5–11 | Ship this release (Today's 3, stars, landing page). Set up the PostHog dashboard (§9). Start posting a 30–60s gameplay clip **every day** on Reels/Shorts/LinkedIn (`marketing/out/games/*`). Post on r/playmygame + Show HN (`marketing/OUTREACH.md`). Contact 10 special-ed schools / OT clinics / senior centres for a free pilot. Start a Google Play closed test (12 testers × 14 days is required for new personal accounts, [Google Play Help](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en-GB)). |
| 2 | Oct 12–18 | Read the first D1/D7 cohorts. Fix the single biggest drop-off. Submit 3 standalone games to CrazyGames/Poki for extra reach. Draft the application (§8). |
| 3 | Oct 19–25 | Get 2–3 pilot institutions committed (even unpaid). Record the 1-minute founder video (§7). Ask 2 founders/mentors to read the application. |
| 4 | Oct 26–Nov 1 | Final numbers into the application. **Submit by Oct 31** to leave a buffer. |
| After | Nov–Dec | Keep shipping a game a week; YC interviews look at what changed since you applied. |

**Numbers that would make the application stand out** (targets, not requirements): 1–5k weekly active players growing
5–10% a week, D1 ≥ 30%, D7 ≥ 10%. For context, the **median** mobile game has D7 ≈ 4% and the top quartile ≈ 7–8%
([GameAnalytics via GameDevReports](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)). YC's
growth rule of thumb is 5–7% a week is good, 10% exceptional ([Paul Graham, "Startup = Growth"](https://paulgraham.com/growth.html)).

---

## 2. Retention research: what keeps people coming back

### 2.1 Benchmarks

| Segment | D1 | D7 | D28/30 | Source |
|---|---|---|---|---|
| All mobile games, median (Q1 2024, >10k games) | 22.9% | 4.2% | 0.85% | [GameAnalytics via GameDevReports](https://gamedevreports.substack.com/p/gameanalytics-benchmarks-in-mobile) |
| Top 25% of mobile games (2025, 11.6k games) | 26.5–27.7% | 7–8% | 75% of games below 3% | [GameAnalytics 2025 via GameDevReports](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks) |
| Puzzle genre | — | highest D7 of any genre | — | [same Q1'24 source](https://gamedevreports.substack.com/p/gameanalytics-benchmarks-in-mobile) |
| Mental-health/wellness apps (closest proxy for "good for you" apps) | — | — | median 3.3% | [Baumel et al. 2019 via HCPLive](https://www.consultantlive.com/view/mental-health-apps-gain-high-uptake-struggle-adherence-retention) |
| Telegram tap-to-earn games | 5–20% | — | collapsed after rewards ended | [The Block](https://www.theblock.co/post/339563/telegram-games-had-trouble-earning-revenue-retaining-users-in-q4-report), [The Defiant](https://thedefiant.io/news/nfts-and-web3/hamster-kombat-loses-259-million-players-amid-86-drop-blockchain-gaming-01e15538) |

**Lumosity, Elevate, Peak and NYT Games do not publish D1/D7/D30.** Unknown.
Median session length is 5–6 min, top quartile 8–9 min ([GameAnalytics 2025](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks)).

**Realistic targets for Utopia** (an inference, not a benchmark): D1 25–30%, D7 7–10%, D30 3–5%.

### 2.2 What measurably moves retention

1. **A daily, shared, finite puzzle (the Wordle effect). Strong evidence.**
   - Wordle went from 90 players to 300k+ in two months; the spoiler-free emoji share drove the spread ([Wikipedia](https://en.wikipedia.org/wiki/Wordle)).
   - Scarcity and *everyone gets the same puzzle* are the core design.
   - Its creator: "People have an appetite for things that transparently don't want anything from you" ([Kotaku](https://kotaku.com/wordle-creator-doesnt-want-his-popular-game-to-take-ove-1848316642)).
   - After the acquisition it brought NYT "tens of millions of new users" ([TechCrunch](https://techcrunch.com/2022/05/04/wordle-new-york-times-user-growth)). NYT puzzles were played 11.1B times in 2024 ([Nieman Lab](https://niemanlab.org/?p=222707)).
2. **Adaptive difficulty. Strong, causal evidence.**
   - EA's engagement-optimised difficulty raised engagement by up to 9% ([Xue et al., WWW 2017](https://archives.iw3c2.org/www2017/proceedings/companion/p465.pdf)).
   - A randomized trial with 300k+ puzzle players found that easing levels for players at risk of quitting raised both short- and long-term retention ([Ascarza, Netzer & Runge, IJRM 2025](https://business.columbia.edu/sites/default/files-efs/citation_file_upload/Personalized_games.pdf)).
3. **Streaks work, and forgiving streaks work better. Strong but double-edged.**
   - Duolingo learners who reach a 7-day streak are 2.4× more likely to return the next day ([Duolingo](https://blog.duolingo.com/improving-the-streak)).
   - Protected weekend days: users were +4% more likely to return a week later ([Duolingo](https://blog.duolingo.com/how-streaks-keep-duolingo-learners-committed-to-their-language-goals)).
   - Peer-reviewed caution: highlighting a *broken* streak lowers engagement, and making it repairable softens the harm ([Silverman & Barasch, JCR 2023](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions)).
   - Goals with built-in "emergency reserve" skip days lead to more persistence after a miss ([Sharif & Shu](https://marketing.wharton.upenn.edu/wp-content/uploads/2016/10/Designing-More-Effective-Goals-by-Using-Emergency-Reserves-A-Field-Experiment.pdf)).
   - **Implication:** Utopia's no-guilt stance is right. If you add a streak, make it a weekly rhythm with rest days.
4. **Endowed progress (start people partway). Moderate evidence.** Loyalty cards with 2 of 10 stamps pre-filled were completed 34% vs 19% for blank cards needing the same 8 purchases ([Nunes & Drèze, via Coglode](https://coglode.com/nuggets/endowed-progress-effect)).
5. **Time to first fun.**
   - Industry guidance is to get players into core play within about 60 seconds ([Playio, vendor blog](https://blog.playio.co/mobile-game-onboarding-retention)).
   - Elevate found its biggest loss happened during onboarding ([Aalto thesis on Elevate](https://aaltodoc.aalto.fi/items/56ced978-fca9-42da-b9fc-a9c51bc0b333)).
6. **Reminders: real but small when measured causally.** Duolingo's optimised reminders gave +2% new-user retention ([KDD 2020](https://paperswithcode.com/paper/a-sleeping-recovering-bandit-algorithm-for)). Claims of "2× retention for push opt-ins" are self-selection ([Airship](https://www.airship.com/blog/7-mobile-engagement-statistics-that-show-how-push-notifications-boost-roi/)). iOS web push only works once the app is on the Home Screen ([WebKit](https://webkit.org/?p=13878)).
7. **Rewarded ads don't cause retention.** Engaged players watch more ads; the correlation runs that way ([Unity](https://unity.com/blog/understanding-the-impact-of-rewarded-ads-on-iap-retention-and-engagement)).

### 2.3 Why brain-training apps lose people

- **Over-claiming.** The FTC fined Lumosity $2M in 2016 for unsupported claims ([FTC](https://ftc.gov/news-events/press-releases/2016/01/lumosity-pay-2-million-settle-ftc-deceptive-advertising-charges)), and a review of 132 papers found little evidence of real-world transfer ([Univ. of Illinois](https://news.illinois.edu/review-finds-little-evidence-that-brain-training-games-yield-real-world-benefits/)). Once the "benefit" story stops being believable, fun is the only reason left to stay.
- **Low enjoyment.** The least enjoyable training game had the lowest compliance ([Boot et al. 2013](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3561600/)).
- **Paywalls.** Lumosity's free tier is about 3 rotating games a day ([Nibble review](https://nibble-app.com/blog/lumosity-review)). Utopia's all-free model is a real differentiator.
- **Gamification alone doesn't fix retention.** In mental-health apps, gamified elements "did not improve, and might weaken, retention" ([HCPLive](https://www.hcplive.com/view/mental-health-apps-gain-high-uptake-struggle-adherence-retention)).
- **Retention bought with rewards disappears when the rewards stop** (the Telegram example above).

---

## 3. What changed in the product because of the research

Shipped in this release:

| Change | Research basis | Where |
|---|---|---|
| **Today's 3**: three games from three different ability families, the same for everyone each day (UTC). Progress dots and a "new games in 3h 3m" countdown. Finishing all three unlocks a **spoiler-free share** (scores and ability emoji plus a link) via the phone's share sheet or the clipboard. | Wordle effect (2.2.1) | Feed card (first for returning players, third for new ones), results screen. `src/platform/retention.ts` |
| **Mastery stars (★1–3) per game.** The first star comes just for finishing (endowed progress); the second at level 4, the third at level 7. Calm games earn stars by returning. Shown on feed cards, the results screen ("New star!") and a new **Stars by ability** section on Progress. | Endowed progress, collections (2.2.4) | Feed, results, Progress |
| **"Up next"** on the results screen suggests a game from a *different* ability, preferring ones you haven't played. During Today's 3, the main button continues to the next daily game. | Variety against repetitiveness (2.3) | Results |
| **First visit still opens straight on a game.** Today's 3 appears as the 3rd card for new players and the 1st for returning ones. | Time to first fun (2.2.5) | Feed order |
| **Saved progress protection.** The app asks the browser for persistent storage after a game. iPhone users see a tip to add Utopia to the Home Screen, because Safari can wipe a site's storage after 7 days without a visit ([WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)). | Churn from lost progress | `PlayOverlay`, Progress |
| **Retention measurement.** `app_open` now carries `days_since_first`, `total_sessions` and `returning`. New events: `daily_complete`, `share`, `star_earned`, `landing_cta`. | You can't improve what you can't see | `src/platform/analytics.ts` |
| **Varied, specific result lines** ("Just 12 short of your best", "Level 6. The game is meeting you there") instead of one fixed sentence. | Repetitiveness | Results |
| **Quieter UI.** The coach tip moved off the game preview. The Play button now uses each game's colours. A smaller side rail, no level pill mid-game. Page headers are compact on phones. Rewards appear *after* the score lands. | UI critique | Feed, game, pages |
| **Landing page** at **/welcome**, for YC, partners and press. | Distribution | `src/app/pages/Landing.tsx` |

Already in place and consistent with the research: per-game adaptive difficulty (the SDK staircase), no streak guilt,
optional rewards, and accessibility settings applied to every game.

Shipped on 5 Oct, from §10 and `HARSH_REVIEW.md`:
- Opt-in weekly rhythm (Settings → Wellbeing; a card on Progress after a second day of play).
- Easier restarts after a break: start 3 levels lower after 3+ days away, 4 lower after 14+ days.
- Share image card for WhatsApp/Instagram.
- Import progress from a file.
- Daily cloud microphone budget (20 min per device, then free on-device recognition).
- Production ads off until H5 approval.
- Privacy page.

Next candidates, in priority order (§10): an opt-in weekly rhythm with rest days, at-risk difficulty easing for
returning players, local feed personalization, an opt-in daily reminder, and a progress backup code.

---

## 4. Monetization

### 4.1 The honest picture

**Ads alone won't fund this on Indian traffic.**

| | Rewarded eCPM | Source |
|---|---|---|
| US mobile | $16–20 | [Playio, citing Mobile Ad Federation](https://blog.playio.co/rewarded-ad-benchmarks-2026) |
| India mobile | ~$0.85–1 | developer reports compiled by [multibagg](https://www.multibagg.ai/market-pulse/articles/cpm-gap-india-global-rates-cmrhgo9uahz46nw0juq794cd0); secondary |
| India web H5 | unknown | Google publishes none |

- **Rough maths** (assumes one rewarded view per daily player): 10,000 daily players is about **$300 a month from India**, or about $3,000 from the US.
- **Voice costs money.**
  - Sarvam STT is ₹30 per audio hour and TTS is ₹15 per 10K characters ([Sarvam pricing](https://docs.sarvam.ai/api-reference-docs/pricing)).
  - That makes about 30 seconds of speech roughly ₹0.25, against about ₹0.08 per Indian rewarded view.
  - **Free voice sessions lose money on ads alone.** Keep TTS caching on (already done) and cap free microphone minutes if usage grows.

### 4.2 Options compared

| Option | Benchmarks | Fit for Utopia |
|---|---|---|
| **Rewarded web ads**: Google H5 Games Ads (`adBreak`, opt-in rewarded) | Rewarded ads must be explicitly chosen; the site must host real games; Google approves publishers ([policy](https://support.google.com/publisherpolicies/answer/11975916)). The mock provider is built and switches with `VITE_ADS_PROVIDER=h5`. | **Now.** Small revenue, real signal. For under-18s use non-personalized ads (India's DPDP rules, [MediaNama](https://www.medianama.com/2025/01/223-data-protection-rules-2025-children-data-india/)). |
| **Consumer subscription** ("Utopia Plus") | Elevate $39.99/yr in the US, India SKUs from ₹149 ([App Store IN](https://apps.apple.com/in/app/elevate-brain-training-games/id875063456)). Duolingo: 9% of MAU pay ([Q2'25 letter](https://www.sec.gov/Archives/edgar/data/1562088/000156208825000165/q2fy25duolingo6-30x25share.htm)). NYT Games about $50/yr with free hooks. Brain-training conversion rates: unknown. | **Month 6.** About ₹99/mo or ₹599/yr in India, about $3.99/mo or $29.99/yr elsewhere. Sells: no ads, history, family profiles, extra cosmetics and seasonal game packs. **Never paywall accessibility.** |
| **B2B / B2B2C**: schools, special-ed, OTs and therapists, eldercare, insurers | BrainHQ is paid for by Medicare Advantage plans ([BrainHQ](https://www.brainhq.com/why-brainhq/brainhq-medicare-advantage-plans/)). CogniFit sells clinician licences ([AWS Marketplace](https://aws.amazon.com/marketplace/pp/prodview-avznqirmrva24)). India has 149M people aged 60+ ([UNFPA](https://www.downtoearth.org.in/amp/story/health/india-will-be-greyer-by-2050-women-will-live-longer-than-men-india-ageing-report-2023-91998)). Dyslexia estimates are 3–15% of children ([PMC review](https://pmc.ncbi.nlm.nih.gov/articles/PMC10159575)). | **The main long-term revenue.** Free pilots now, paid per-seat by month 6–18. Product: a teacher or therapist dashboard, assignable game sets, exportable progress. |
| **Grants (non-dilutive)** | Startup India Seed Fund (up to ₹20L grant, needs DPIIT recognition, [myScheme](https://www.myscheme.gov.in/schemes/sisfs-fs)). AssisTech Foundation track (₹20L grant + up to ₹50L equity, [Entrepreneur India](https://india.entrepreneur.com/?p=83634)). Saksham 2.0 (₹15L, includes "Cognitive & Learning Technologies", [link](https://www.startupgrantsindia.com/providers/saksham/saksham-2-0)). NCPEDP–Mphasis seed (₹5L, [link](https://www.incorpx.io/grants/ncpedp-mphasis-at-hub-seed-grant-2026)). | **Apply now.** Very good fit for an accessibility product. |
| **CSR funding** | Special education for children, the elderly and differently abled is an eligible Schedule VII activity ([iPleaders](https://blog.ipleaders.in/schedule-vii-of-companies-act-2013/)). The funds must flow through a registered NGO implementing agency ([Taxmann](https://www.taxmann.com/post/blog/corporate-social-responsibility-and-implementation-agencies-legal-analysis/)). | Partner with one NGO; Utopia is the technology vendor. |
| **Distribution platforms** | Poki (reportedly 50/50) and CrazyGames (about 60% of ads) ([Playgama](https://playgama.com/blog/?p=14181)); secondary. YouTube Playables revenue share is a pilot with unpublished terms ([Google](https://developers.google.com/youtube/gaming/playables/reference/monetization)). Play Store via TWA: one-time $25, Play fee 15% ([Google](https://blog.google/intl/en-in/products/platforms/sustaining-google-play-as-a-valuable-partner-to-indias-app-ecosystem/)). | Mainly **acquisition**: publish 3–5 games as funnels back to Utopia. |
| **Licensing / white-label / branded games** | No public pricing (unknown). | Only when inbound demand appears. |

### 4.3 Staged plan

**Now to month 3: prove the habit**
- Switch on real H5 rewarded ads once Google approves the site. Until then, keep production ads off; see `PRD_HARDENING.md` H4, since the live site currently shows a mock ad.
- Apply for DPIIT recognition, then SISFS, ATF, Saksham and NCPEDP.
- Run 3–5 free pilots with special-ed schools, OT clinics and senior centres.
- Publish games on Poki/CrazyGames and the Play Store as funnels.

**Month 6: first money**
- Launch Utopia Plus (pricing above).
- Turn 1–2 pilots into paid annual licences; even a ₹5–10k letter of intent is a strong signal for investors.
- Sign one NGO partnership for CSR funding.
- Illustration only, not a forecast: 50k MAU × 2–4% paying is about 1–2k subscribers, or ₹10–20L ARR in India.

**Month 18: B2B2C as the main revenue line**
- Per-seat licences for schools, clinics and eldercare.
- Corporate or insurer wellness pilots on the BrainHQ model.
- Start a university-partnered study, so any future claims are backed by evidence.

**What not to do**
- Real-money or cash-out mechanics: India's 2025 Online Gaming Act bans money games ([SCC Online](https://www.scconline.com/blog/post/2025/08/24/promotion-regulation-online-gaming)). Orbs must never be sold for cash-out.
- Interstitial ads in relaxed or accessibility modes.
- Becoming a regulated digital therapeutic early. Akili went from about a $1B valuation to a roughly $34M sale ([MDDI](https://www.mddionline.com/augmented-virtual-reality/akili-to-go-private-through-merger-with-virtual-therapeutics)).

---

## 5. Market and competitors

### Market size

These are vendor estimates that vary widely. Quote them as ranges and lead with your own bottom-up numbers.
- **Brain-training apps:** about $9–11B in 2025–26 ([TBRC](https://www.wboc.com/online_features/press_releases/brain-training-apps-market-forecast-to-hit-21-09billion-by-2030-amid-strong-industry-growth/article_fe39edbb-0df8-56f1-9432-e67b42c17c62.html)).
  - Peak sold for only about $5M despite 60M+ downloads ([PopReach](https://newswire.ca/en/releases/archive/March2021/18/c4003.html)), so real category revenue is much smaller than those headlines suggest.
- **India gaming:** $3.8B in 2024, projected at $9.2B by 2029 ([Lumikai/Google via GamesBeat](https://gamesbeat.com/indias-game-market-could-grow-from-3-8b-to-9-2b-by-2029-lumikai/)).
  - 591M gamers, 44% of them women and 66% outside metros ([YourStory](https://cwv.yourstory.com/2024/11/indian-female-gamers-countrys-gaming-population-lumikai)).
- **Puzzle mobile games:** $14.4B IAP in 2025 ([Sensor Tower via GameDevReports](https://gamedevreports.substack.com/p/sensor-tower-state-of-gaming-2026)).

### Competitors

| Competitor | Model | Gap Utopia fills |
|---|---|---|
| Lumosity | Subscription, FTC history | Paywalled, English-first, claims-heavy |
| Elevate | Subscription | Same |
| Peak | Subscription | Same |
| CogniFit | B2C + clinician licences | Assessment-heavy, clinical feel |
| BrainHQ | Payer-funded | US-focused |
| NYT Games | Free daily hooks + bundle | Not ability-designed, no accessibility focus, no Indic voice |
| Duolingo | Habit + 9% paid | Language only |
| WizKlub, BrainGymJr, EdSix | India, kids | Classes or school sales, not a free consumer feed |
| Ivory | India, eldercare | Narrow audience |
| Pops (YC P2026) | AI game feed ([YC](https://www.ycombinator.com/companies/industry/gaming)) | Shows YC funds game feeds. Utopia's angle is accessibility + Indian-language voice + designed-around-abilities |

**Positioning:** *"The free, no-sign-up, accessibility-first game feed, playable by voice in Hindi and English."*

**Be honest about defensibility.** Individual games are easy to copy. The moat has to come from:
- Distribution (the feed, daily ritual and sharing).
- The accessible-by-default SDK that makes new games fast to build.
- Indian-language voice.
- B2B relationships.

---

## 6. Claims safety

**What happened to Lumosity**
- The FTC ordered "competent and reliable scientific evidence" before Lumosity could claim school, work or ageing benefits ([FTC](https://www.ftc.gov/news-events/news/press-releases/2016/01/lumosity-pay-2-million-settle-ftc-deceptive-advertising-charges-its-brain-training-program)).
- Health claims generally need randomized controlled trials ([Covington on FTC 2022 guidance](https://www.cov.com/en/news-and-insights/insights/2023/01/ftc-issues-new-guidance-on-health-related-claims-to-replace-the-dietary-supplements-advertising-guide)).

**Say:**
- "Designed around memory, attention, language…"
- "Inspired by cognitive science / published research tasks"
- "Accessible by default"
- "A better five minutes than endless scrolling"

**Never say:**
- "improves memory", "makes you smarter", "boosts grades"
- "prevents dementia", "clinically proven"
- "therapy for ADHD/dyslexia"
- Never use undisclosed incentivized testimonials.

The app copy currently passes this check: I searched the source for these phrases and found none.

---

## 7. YC: how it works and what they look for

- **Clarity beats everything.** Describe the product matter-of-factly. Founders matter more than ideas. Show your most impressive achievement. Admit your weaknesses ([YC How to Apply](https://www.ycombinator.com/howtoapply)).
- **Solo founders:** accepted, but YC says the odds are steeper ([YC FAQ](https://www.ycombinator.com/faq)). Roughly 1 in 5 recent companies were solo ([RuntimeWire](https://runtimewire.com/article/yc-solo-founders-startups-bits-atoms-2026)).
  - Address it head-on: what you shipped alone, and how you'll hire.
  - YC's cofounder matching through [Startup School](https://www.startupschool.org/) is an option.
- **Consumer games:** fundable (Pops, YC P2026, is "an infinite feed of games"), but not a stated priority ([YC Gaming](https://www.ycombinator.com/companies/industry/gaming)). Lead with growth, retention and the AI and voice angle.
- **Traction:** about half of one batch had no revenue at application ([YC blog](https://www.ycombinator.com/blog/common-misconceptions-about-applying-to-yc)). Active users and retention count. **Never report mock-ad revenue as revenue.**
- **The 1-minute video:** founders only, "not the place to submit a demo", speak from bullet points rather than a script ([YC video](https://www.ycombinator.com/video/)). Suggested bullets:
  1. Who you are, in one line, and the most impressive thing you've built.
  2. What Utopia is: "reels you play, not watch."
  3. Why you: you started Utopia for accessibility, and the awards that followed.
  4. The one number you're proudest of (e.g. D7 or weekly growth).
  5. What's next: Indian languages and schools.
- **Startup School:** about 7 weeks at 1–2 hours a week, with weekly progress updates ([startupschool.org](https://www.startupschool.org/)). The dated updates make good evidence of momentum for the application.

---

## 8. Draft YC application answers

Replace every `[bracket]` with real numbers before submitting. Keep answers short; YC reads thousands.

**Company name:** Project Utopia

**Describe what your company does in 50 characters or less:**
> A TikTok-style feed of short games you play

Alternatives: "Reels you play, not watch: a feed of mini-games" · "Accessible brain games in a reels-style feed".

**Company URL:** https://playutopia.pages.dev/welcome · **Demo:** https://playutopia.pages.dev

**What is your company going to make? Please describe your product and what it does or will do.**
> Utopia is a vertical feed of 1–4 minute games, like Reels, but every card is a live game you can play in about a
> second with no sign-up. Each game is designed around one ability (memory, attention, planning, language, timing,
> calm) and inspired by a published research task, but built to feel like Monument Valley, not a test. 10 of the
> 30 games are voice games: they speak and listen in English and Hindi using Sarvam AI, so people who'd rather speak
> than read or type can play. Accessibility is built into the SDK every game uses (dyslexia-friendly font, relaxed
> timing, captions, high contrast, one-handed play), so every new game is accessible by default. A shared daily
> challenge ("Today's 3") with a shareable result brings people back. Next: more Indian languages, a classroom and
> clinic mode, and a paid plan.

**Where do you live now, and where would the company be based after YC?**
> [City], India. [Your honest answer about relocating to SF for the batch.]

**How far along are you?**
> Live since [launch date]. 30 games on one SDK (React, Three.js, PixiJS, Web Audio, Sarvam AI voice), installable
> PWA, anonymous analytics. [N] weekly active players, growing [X]% week over week; D1 [X]%, D7 [X]%; average
> [X] games per session. [N] pilot conversations with special-education schools / clinics / senior centres.

**How long have each of you been working on this? How much of that has been full-time?**
> Project Utopia started [year] as accessibility-awareness games (Color Strike 3D, The Virus Warrior). The current
> product has been built since [month 2026], [full-time / X hours a week alongside studies].

**How many active users or customers do you have? How many are paying? Who is paying you the most, and how much do they pay you?**
> [N] weekly actives, [N] monthly. No paying customers yet. Rewarded ads are integrated and waiting for Google
> approval; the first paid product will be school/clinic licences.

**If you are applying with the same idea as a previous batch, did anything change?** [Only if applicable.]

**Why did you pick this idea to work on? Do you have domain expertise in this area?**
> I started Project Utopia to build for people with dyslexia and colour blindness. I was named one of Infosys
> Springboard's 20 Under 20 for it, and it won best project at the National Children Innovation Challenge (GUSEC ×
> UNICEF). I watched people spend hours on feeds that give nothing back, while the "good for you" alternatives are
> paywalled, English-only and dull. The feed format is the distribution insight; accessibility and Indian-language
> voice are what make it work for people the incumbents ignore.

**What's new about what you're making? What substitutes do people resort to because it doesn't exist yet?**
> People scroll Reels/Shorts or play Lumosity/Elevate behind a paywall. Nobody combines instant feed discovery, free
> play, accessibility-by-default and Indian-language voice. Our SDK makes a new accessible game take days, so the
> library can grow to hundreds.

**Who are your competitors? What do you understand about your business that they don't?**
> Lumosity, Elevate, Peak (subscription brain training), NYT Games (daily puzzles), Duolingo (habit). They sell
> improvement claims behind paywalls; research shows little real-world transfer, and the FTC fined Lumosity for
> overclaiming. We think the durable reason to come back is fun plus a daily ritual, not claims, and that the
> under-served users (dyslexic, older, non-English, low-literacy) are a distribution advantage, not a niche.

**How do or will you make money? How much could you make?**
> Near term: opt-in rewarded ads and a cheap "Plus" plan (~₹599/yr India, ~$29.99/yr elsewhere). Main line:
> per-seat licences for special-education schools, therapists and eldercare in India, where 149M people are 60+ and
> estimates put dyslexia at 3–15% of children; plus accessibility grants/CSR via NGO partners. [Add your bottom-up:
> e.g. N schools × seats × price.]

**Which category best applies?** Consumer / Gaming (alternative: Education).

**Something impressive each founder has built or achieved:**
> I built all of Utopia solo: 30 games, a game SDK with accessibility built in, Sarvam voice integration, PWA,
> analytics, rewards system and hosting. Infosys Springboard 20 Under 20; NCIC (GUSEC × UNICEF) best project;
> accepted into Anthropic's Claude for Startups program. [Add one specific hard thing you solved.]

**Are you looking for a cofounder?** [Honest answer. If yes, say what skills, e.g. growth / B2B sales.]

**Equity / legal entity / funds raised:** [Fill in honestly. If not incorporated, say so.]

**Founder video:** see §7.

---

## 9. Metrics to track

PostHog insights to save on one dashboard. All use existing anonymous events:

| Question | Insight |
|---|---|
| Weekly actives and growth | Trends → `app_open` unique users, weekly |
| D1 / D7 / D30 retention | Retention → start `app_open` (first time), return `app_open`, daily and weekly |
| Do returning players use the daily challenge? | Trends → `daily_complete` per day; funnel `app_open` → `game_session_end` (daily) → `daily_complete` |
| Sharing (viral loop) | Trends → `share`; breakdown of `$initial_utm_source = share` new users |
| Mastery | Trends → `star_earned` |
| Games per session | Trends → `game_session_end` count ÷ `app_open` count |
| Where people drop | Trends → `game_exit` by `state`, by `game_id` |
| Landing page conversion | Funnel → `$pageview /welcome` → `landing_cta` → `game_session_end` |
| Voice use | `game_session_end` filtered to voice games |
| Accessibility adoption | `setting_changed` breakdown by `key` (your unique metric for YC) |

---

## 10. Roadmap

In priority order, with the research behind each:

1. **Production ads off until H5 approval**, error boundary, rate limit and spend cap on the voice API, and a privacy page. See `docs/PRD_HARDENING.md` P0.
2. **Opt-in weekly rhythm** ("4 of 7 days", 2 rest days, "rest day used 🌙", never "streak lost"). Basis: Silverman & Barasch; emergency reserves; Duolingo.
3. **At-risk easing:** start returning-after-a-break players 1–2 levels lower. Basis: Ascarza et al.
4. **Local feed personalization** from completions, replays and skips, with 20% exploration.
5. **Opt-in daily reminder**, off by default, one a day, stops after 3 are ignored. Basis: Duolingo KDD, +2%.
6. **Progress backup code / QR**, so a cleared browser doesn't lose everything.
7. **Classroom/clinic mode:** a teacher sets a game list, sees anonymous class progress, no ads.
8. **More Indian languages** for the voice games via Sarvam (Tamil, Telugu, Bengali, Marathi…).
9. **A new game every week**, announced in the feed. Seasonal "remix" variants of existing games.
10. **Aggregate daily stats** ("12,430 players finished today's 3"). Needs a tiny counter endpoint.

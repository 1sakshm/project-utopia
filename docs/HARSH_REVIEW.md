# A harsh review of Project Utopia

*Written in the voice of a skeptical startup-application reviewer whose default answer is "no". This is a role-play
meant to stress-test the idea before real reviewers do. It is not a real YC opinion, and it is deliberately
unkind. Every criticism is followed by what to do about it.*

---

## The verdict, first

**Decision: Reject (this round).**

> "A talented builder has made a beautiful thing. I can't tell who it's for, why they'd come back, or how it becomes
> a company. There is no evidence anyone wants it yet. Thirty games and zero proof of demand is a portfolio, not a
> startup. Reapply with numbers."

That's the paragraph a reviewer writes in about 90 seconds. The rest of this document explains why, and how to make
sure they can't write it next time.

---

## 1. "What is this, actually?" The positioning is mush

**The criticism.** Depending on which page I read, Utopia is any of these:
- a TikTok for games;
- brain training;
- an accessibility product for dyslexic and low-vision people;
- a Hindi voice-game platform;
- a wellbeing / anti-doomscrolling app;
- an edtech tool for schools and special-ed;
- an eldercare product for insurers.

That's seven companies. Each one has a different user, a different competitor and a different business model. When
a founder can't pick, it usually means they haven't found the users who actually care. The landing page says "Reels
you play", the YC draft talks about dyslexia, and the monetization plan bets on schools. A reviewer reads that as
"doesn't know yet".

**Fix it.**
- **Pick one wedge user for the next 90 days** and say it in one sentence. Two candidates are much stronger than the rest:
  - *A.* "Indian adults who scroll Reels, playing short games in Hindi/English instead". This is a consumer growth story.
  - *B.* "Special-education teachers in India who need calm, accessible 5-minute activities". This is a B2B pull story.
- **Run both as cheap experiments for 2 weeks** and keep the one that pulls:
  - For A: daily clips with tracked links.
  - For B: 15 teacher calls.
- **Rewrite the one-liner** around the winner. Everything else, accessibility included, becomes *why it wins*, not *what it is*.

---

## 2. There is no evidence of demand

**The criticism.**
- No user numbers, no retention curve, no revenue, no waitlist, no letters of intent.
- "Live since September" plus a few Reddit posts doesn't make a market.
- The draft application has `[N]` placeholders where traction should be. That's the most honest part of it, and the most damning.
- Infosys 20 Under 20 and the UNICEF challenge are signals about *you*, not about *demand*.

**Fix it.**
- **Get 100 people who'd be upset if Utopia disappeared.** Not 10,000 visitors.
- Find them by hand: WhatsApp groups, your school, special-ed teachers, dyslexia communities, parents. Watch them play.
- Measure one number that proves the habit: **the percentage of first-week players who come back on day 7.** Track it
  weekly and put a dated chart in the application. A small number that's rising beats a big number that's flat.
- Collect 5 quotes from real users (with permission, no incentives).
- One paid pilot, even ₹5,000, is worth more than any award.

---

## 3. The category has a graveyard

**The criticism.**
- Brain training is where good intentions go to die.
  - Lumosity was fined by the FTC.
  - Peak sold for about $5M after 60M downloads.
  - Akili's FDA-cleared game went from about a $1B valuation to a roughly $34M sale.
- Research says the benefits don't transfer to everyday life, and your own About page admits it. So if the games don't
  make people better at anything, the only reason to play is fun.
- If it's fun you're selling, you're competing with every free game on the planet, including Candy Crush, NYT Games
  and Reels themselves. Why does the "designed around an ability" framing matter at all?

**Fix it.**
- **Stop leading with cognition.** Lead with *the experience*: "the calmest five minutes on your phone",
  "games you can talk to in Hindi". Keep "designed around abilities" as a quality bar inside the product, not the pitch.
- If you go after schools or clinics, the value isn't "brain improvement". It's **"an accessible, ad-free activity
  that takes the teacher zero prep and works for every kid in the room."** That claim is true, testable and sellable.

---

## 4. "Why can't someone copy this in a weekend?"

**The criticism.**
- Every individual game is a known research task with a nice skin.
- Poki, CrazyGames, YouTube Playables and Pops (YC P2026) already do feeds of games, with distribution you don't have.
- AI can now generate small games fast; that's how you built 30. That's great for your speed and terrible for your moat.
- "Accessible by default" is a feature a funded competitor ships in a sprint.

**Fix it.**
- Be honest that the games are not the moat. Name what can be:
  1. **A habit and a community.** A daily shared ritual (Today's 3) plus sharing, done better than anyone in Hindi/English.
  2. **Indian-language voice gameplay that actually works**: low latency, accent-robust, kid- and elder-friendly. That's hard and data-hungry.
  3. **Distribution relationships**: schools, NGOs and eldercare networks that a Bay Area startup won't bother with.
  4. **The SDK as leverage**: if the SDK makes accessible games 10× faster, that's an engine, not a moat. Say so plainly.
- In the application, answer "what do you understand that others don't" with something only *you* learned from users.
  Not a feature list.

---

## 5. The business model doesn't add up yet

**The criticism.**
- Your own research says Indian rewarded ads earn about $1 per thousand views.
- A voice session costs more in Sarvam fees than one ad view earns. **Your most differentiated feature loses money on every use.**
- The "Plus" plan has no reason to exist yet. Everything is free, and accessibility can't be paywalled.
- Schools in India buy slowly, through procurement, often for little money.
- CSR money has to go through an NGO.
- Insurers want clinical evidence you don't have.

Every path is either tiny, slow, or gated on proof you haven't started gathering.

**Fix it.**
- **Run the unit economics in a spreadsheet:** cost per session (Sarvam, hosting) against revenue per session for each channel.
- **Make voice cheaper:**
  - Cache all TTS (done).
  - Use on-device speech recognition where the browser supports it, with Sarvam as the fallback.
  - Cap free microphone minutes.
- **Pick one monetization experiment to run before the interview.** The best candidate: a paid classroom pack, about
  ₹999/term per teacher, giving no ads, a game list, and a simple "what my class played" view. Sell 3 of them.
- **Don't promise insurer revenue.** Mention it only as a long-term option that depends on evidence.

---

## 6. Retention is a guess dressed up as a plan

**The criticism.**
- Today's 3, stars and "up next" all shipped the same week as this review, so there is zero data that any of them work.
- No accounts means a cleared browser or a new phone wipes your users. You can't re-engage them: no email, no push, no
  identity. Your retention ceiling is set by Safari's storage policy.
- "No streak guilt, no notifications" is admirable, and it also means you've given up the two strongest levers
  consumer apps have. What replaces them?

**Fix it.**
- **Measure before adding more.** Two weeks of D1/D7 cohorts before shipping any new retention feature.
- **Add an optional, low-friction identity:** "Save your progress" with a magic link, a phone number or Google sign-in,
  offered *after* the 3rd session and never required. It gives you sync, re-engagement and a real user count.
- **Ship the opt-in weekly rhythm and the opt-in daily reminder** (YC_PLAN §10) and A/B test them. Ethical levers are
  still levers.
- WhatsApp is how India shares. Make the share card a beautiful image, not just text, and tune it for WhatsApp.

---

## 7. Thirty games is a vanity metric

**The criticism.**
- Quantity reads as "built a lot, validated nothing".
- Some games are visibly weaker than others. The voice games look like quizzes.
- A first-time player who lands on a mediocre game leaves, and that one experience defines Utopia for them.
- The pitch says "1,000 games". Nobody wants 1,000 games. They want three they love.

**Fix it.**
- **Cut to a "best 12" feed** for new players, chosen by completion and replay data. Keep the rest in the Library.
- Make the *voice* games the most polished. They're the thing nobody else has.
- **Replace "1,000 games" with "the best new game every week"** in the pitch: quality cadence, not volume.

---

## 8. Product quality and trust issues a reviewer will hit in the demo

**The criticism.** A partner will open the demo on their phone during the interview. Things they could hit:
- A 4–5 MB first download. A slow first load on hotel Wi-Fi is fatal.
- A fake "Mock ad" asking them to watch it for orbs. That looks unfinished, or worse.
- No privacy policy, even though the app uses the microphone.
- WebGL previews that may stutter on a mid-range phone. They've never been tested on one.
- A landing page that leads with awards and a program acceptance rather than users.

**Fix it.** Before Nov 2:
1. Turn production ads off until real ads are approved.
2. Publish a plain privacy page.
3. Precache only the app shell, not the whole library.
4. Test on a ₹10k Android phone and fix the worst stutter.

These are all in `PRD_HARDENING.md` (P0 and Q1). They're days of work and they remove "this isn't real yet" from the
reviewer's mind.

---

## 9. The founder risk

**The criticism.**
- **Solo founder.** Solo founders are accepted, but the odds are steeper.
- **A student**, possibly part-time.
- **Heavy use of AI to build.** The obvious questions: "Can they build without it? What happens when the code breaks
  at 2am?" and "Who sells to schools while they code?"
- **Credibility gaps.** The awards are from an earlier version of the project, and the Claude program is a credits
  program, not validation.

**Fix it.**
- **Own the solo story with evidence of speed.** "I shipped 30 games, voice in two languages and a game SDK in N weeks"
  is impressive, *if* paired with users.
- **Say clearly how much time you'll give it.** If you're accepted, are you full-time? Reviewers need a yes.
- **Address AI head-on:** "AI tools are how a solo founder ships like a team. I own the architecture and debug it
  myself." Then give one example of a hard problem you solved: the touch-scroll fix, the revive system, the Sarvam proxy.
- **Get a second person** if you can, even part-time: someone who loves selling to schools, or growth. Talk to them
  before applying. YC's cofounder matching exists for this.
- Put the awards in one line, not on the landing page's front door.

---

## 10. The application itself

**The criticism.**
- The draft answers are long, earnest and full of features.
- The 50-character description ("A TikTok-style feed of short games you play") makes me think of Pops, Poki and every
  hyper-casual app. Why you?
- "What's new" is a list of adjectives. The competition answer leans on Lumosity's FTC fine. Pointing at a competitor's
  scandal isn't insight.

**Fix it.**
- **Rewrite every answer to half its length.** One number per answer, if you have one.
- **Make the one-liner specific to the wedge** from §1. For example:
  - "Short voice games in Hindi and English, in a Reels-style feed"
  - "Accessible 5-minute classroom games for special-ed teachers"
- **Lead with your best fact:** a growth rate, a retention number, or a quote.
- **The insight answer** should be something you learned by watching users. Example shape: "Older users wouldn't touch
  a game that needed reading, but played voice games 3× longer." It has to be real, so go find it.
- **Record the video unscripted**, five bullets, under a minute. Don't demo. Show that you know your user.

---

## Scorecard (as the harsh reviewer)

| Dimension | Score /5 | Why |
|---|---|---|
| Founder ability to build | 4 | Shipped an absurd amount, alone |
| Founder–market insight | 2 | Clear care for accessibility; no user evidence yet |
| Clarity of idea | 2 | Seven companies in one |
| Evidence of demand | 1 | None yet |
| Defensibility | 1.5 | Games are clonable; moat is unproven |
| Business model | 1.5 | Every path is tiny, slow or gated |
| Market | 3 | Big markets, but a hard category |
| Product polish | 3.5 | Beautiful; trust and performance gaps |

**What would flip this to an interview:**
- One wedge, stated in one line.
- A dated weekly chart showing growth and D7 retention.
- Three real user quotes.
- One paid pilot.
- A demo that loads fast with no fake ads.

All of it is achievable in four weeks. None of it needs more games.

---

## The 4-week rescue plan, in one list

1. **Week 1:**
   - Turn production ads off; publish a privacy page; precache only the app shell.
   - Pick two wedge experiments (consumer Hindi/English voice vs. special-ed teachers).
2. **Week 2:**
   - 15 teacher calls and 100 hand-recruited players. Watch 10 of them play live. Write down what surprised you.
   - Cut the new-player feed to the best 12 games.
3. **Week 3:**
   - Choose the wedge from the data and rewrite the one-liner, landing hero and application around it.
   - Sell one paid pilot or classroom pack.
   - Add optional "save your progress" sign-in.
4. **Week 4:**
   - Cut the application to half its length with real numbers and quotes.
   - Record the video. Submit by Oct 31.

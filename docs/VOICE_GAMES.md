# Voice games (Sarvam AI): designs

Ten speech & auditory games. Infrastructure is built (see "Voice games" in `docs/GAME_AUTHORING.md`).
Reference implementation: **`src/games/word-echo/`** (copy its structure, look and patterns).

Shared rules for every voice game:
- Pixi v8, portrait-safe layout, luminous style matching Word Echo (dark gradient, glow sprites, glass cards,
  soft motes, Manrope + Devanagari font stack `Manrope, "Noto Sans Devanagari", "Nirmala UI", system-ui, sans-serif`).
- **English + Hindi**: content for both languages in `content.ts`; `createLangToggle(ctx, cb)` top-right; switch
  applies from the next round. Hindi content must be natural, child-safe, and correct Devanagari.
- **Speech** via `ctx.voice.speak(text, { lang })` (await it: it resolves when playback ends); call
  `ctx.voice.prefetch([...])` for the next round's phrases. Always `Promise.race` speech with a `ctx.wait(...)`
  cap so a slow network never stalls the game.
- **Spoken answers** only via `createAnswerBar(ctx)` → `await bar.ask({ prompt })` (mic or typing; handles
  consent, failures, captions). Never call `getUserMedia` yourself.
- **Captions/accessibility**: if `ctx.settings.captions || ctx.voice.source() === 'none'`, show what was spoken
  (where showing it would give the answer away, show it after the answer). Honor `timingMultiplier`,
  `noTimePressure` (untimed variant), `reducedMotion`, `highContrast`, `textScale`; tap targets ≥ 48px; keyboard play.
- **Preview mode**: no audio/mic ever (the SDK already no-ops). The ghost must *visibly* play: show spoken text as
  captions/bubbles and animate answers so the mechanic reads silently in the feed. Never call `ctx.end()`.
- Manifest: `input.requiresAudio: true` (except where noted), honest science note (no claims), credits include
  `'Voice: Sarvam AI (bulbul)'` and, for mic games, `'Speech recognition: Sarvam AI (saaras)'`.
- Session 2–3 minutes → `ctx.end()` with the manifest's result stats. Adaptive difficulty via `ctx.staircase`.

---

## 2. Digit Echo (`digit-echo`): working memory, mic
Hear digits spoken one per ~0.9s ("7… 2… 9…"). Then say them back (or type). Later levels: **say them backwards**
(shown with a ↺ cue). Parse with `parseDigits(transcript)` (handles "7 2 9", "729", "seven two nine",
"सात दो नौ"). Span staircase 3→9 (2-up/1-down); 12 trials or 3 misses. Visual: a vertical "lantern string" where
each digit lights a lantern as it's spoken; after answering, lanterns show green/rose per digit (right/wrong) with the
correct digit revealed. Stats: longest forward, longest backward, accuracy %. Keyboard: typing field via the bar.
Science: digit span (forward/backward).

## 3. Sound Sleuth (`sound-sleuth`): phonological awareness, listening only
Hear two words back-to-back (minimal pairs). Tap **Same** or **Different** (big two-button choice; keys ← / →
or S / D). Levels: obvious pairs → close pairs (cap/cat, ship/sip, pen/pan, bat/pat) → vowel pairs → quick
triplets ("which one was different: 1, 2 or 3?" at high levels). Hindi pairs: कल/काल, दिन/दीन, पल/फल,
बाल/भाल, सुर/सूर, जल/झल… (~40 pairs each language; ~30% "same" trials). Visual: two sound-shells that glow as
each word plays; shells crack open to show both words after answering. Captions: show words only after answering.
Stats: accuracy %, hardest level, streak. Science: auditory minimal-pair discrimination.

## 4. Say It Back (`say-it-back`): phonological awareness, mic
Hear a word/phrase, then say it back (or type). Score with `similarity(transcript, target)`: ≥0.85 = perfect,
≥0.6 = close (partial points). Levels: short words → 2–3 word phrases → longer phrases → gentle tongue-twisters
("red lorry yellow lorry", "कच्चा पापड़ पक्का पापड़"). Visual: a sound-wave ribbon that draws itself from the
target phrase; your transcript appears underneath with matched words glowing (word-level diff). 10 prompts.
Stats: perfect repeats, average match %, longest phrase. Science: verbal repetition (phonological loop).

## 5. Name Rush (`name-rush`): reading fluency, mic (`requiresAudio: false`: it's visual naming)
Rapid automatized naming: a row of 4–8 simple pictures (drawn with Pixi Graphics: sun, moon, star, fish, tree,
house, ball, cup, key, bird, also simple colors/shapes) appears; **name them all aloud in one breath** (one
`bar.ask` with maxMs ~8000). Count items named correctly *in order* (use `heardWord`/`bestMatch` per expected
word in sequence, with accepted synonyms/Hindi names: सूरज/सूर्य, चाँद, तारा, मछली, पेड़, घर, गेंद, कप, चाबी,
चिड़िया). Time from bar-open to transcript = speed. Levels: more items, fewer repeats, mixed categories. Typing
mode: type the names separated by spaces. Visual: pictures on floating glass tiles; each correctly named tile gets a
check glow in sequence. Stats: items per second (best), accuracy %, longest row. Science: RAN tasks.

## 6. Story Shells (`story-shells`): sustained attention / listening comprehension, listening only
Hear a 2–4 sentence micro-story (content.ts: ~20 stories per language, gentle, original, child-safe). Then answer
2 multiple-choice questions (tap one of 3 illustrated-ish choice cards: who / what / where / sequence). Stories get
longer; later questions ask about order or detail. "Hear again" once per story (costs half points). Visual: a
seashell that opens while the story plays, releasing drifting glowing words (decorative, not readable unless
captions on); choice cards rise from the sand. Stats: questions right %, stories completed, longest story.
Science: listening comprehension.

## 7. Two Voices (`two-voices`): divided attention, listening only (best with headphones)
Dichotic listening: a **female voice in the left ear** and a **male voice in the right ear** say *different* words
at the same moment (`speak(a, { voice:'female', pan:-1 })` + `speak(b, { voice:'male', pan:1 })` started together).
A cue says which to report ("LEFT / female" or "RIGHT / male", shown by an ear icon + voice icon, never color only).
Tap the word you heard from 4 choices. Later: no cue until after the words (divided attention), then both words
(pick both). If `ctx.voice.source() !== 'sarvam'` (device speech can't overlap or pan), fall back to **sequential**
mode (voice A then B, cue after) and say so in a caption. Visual: two glowing ears/orbs on each side emitting ripples.
Headphone tip on the first round. Stats: accuracy %, cued vs uncued accuracy. Science: dichotic listening.

## 8. Luna Says (`luna-says`): inhibition, listening only
Simon-says: Luna (a friendly glowing moon character drawn in Pixi) speaks commands: "Luna says tap the star",
"Luna says swipe up", "tap the circle" (no "Luna says" → **don't** do it). 4 big shape buttons (star, circle,
square, triangle, all distinct shapes + labels) and swipe gestures (keys: 1–4 for shapes, arrows for swipes).
Response window ~2.5s × timingMultiplier; withholding correctly on a no-Luna command scores. Levels: faster,
more no-Luna commands (20% → 40%), compound commands ("Luna says tap the star then the circle"), and tricky
near-phrases ("Luna said…", "Luna says don't tap"). Hindi: "लूना कहती है तारा दबाओ". Visual: Luna's face
glows and her mouth animates while speaking; correct actions sparkle. Stats: correct withholds %, accuracy %,
average response ms. Science: go/no-go / Simon-says inhibition.

## 9. Lingo Switch (`lingo-switch`): cognitive flexibility, listening only
Bilingual switching: a word is spoken **in English or Hindi** (switching unpredictably, `lang` per word); tap the
matching picture/meaning card from 3–4 (cards show simple Pixi-drawn icons + the word in the *other* language as a
small label). Trials where the language switches from the previous one are "switch trials"; measure accuracy and
response time for switch vs repeat trials. Levels: faster pace, more switches, similar-meaning distractors. Uses
the same index-aligned bilingual word bank idea as Word Echo. Visual: two color-coded (plus EN/हि badge) speech
bubbles slide in from left (English) or right (Hindi). Stats: accuracy %, switch cost ms (lower is better),
best streak. Science: language/task switching (switch cost). `requiresAudio: true`.

## 10. Voice Sprint (`voice-sprint`): verbal fluency, mic
A category is spoken and shown ("animals", "fruits", "things in a kitchen", "things that fly"; Hindi: जानवर,
फल, रसोई की चीज़ें…). **40 seconds** (untimed variant with a 12-item goal under noTimePressure): name as many as you
can. Call `bar.ask({ maxMs: 6000 })` repeatedly (short bursts); split each transcript with `words()` and match
against the category list (content.ts: ~40–80 accepted items per category per language, including common
multi-word items and Hinglish/Hindi variants); duplicates ignored. Each accepted word pops out as a glowing bubble
into a growing constellation; rejected words fade grey briefly. 3 rounds with different categories. Stats: best
round count, total unique words, categories played. Science: category (semantic) verbal fluency tasks.

---

## Feed placement
Interleave the ten ids into `EDITORIAL_ORDER` (`src/platform/abilities.ts`) so no two voice games are adjacent and
no two same-ability games touch: e.g. insert one voice game after every 2 existing games.

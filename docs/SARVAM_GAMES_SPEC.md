# Spec: 5 speech & auditory games powered by Sarvam AI

Status: owner-approved. **Budget is very tight (~$15): implement directly, no subagents, reuse existing
patterns, keep verification to one smoke run per game + typecheck.** Don't redesign anything else.

## Read first (nothing else needed)
- `docs/GAME_AUTHORING.md` (the game contract + rules), `src/sdk/types.ts`, `src/sdk/pixi.ts`.
- Reference Pixi game: `src/games/firefly-night/` (index.ts manifest + game.ts). Copy its structure.
- Games auto-register from `src/games/*/index.ts`. Feed order: `EDITORIAL_ORDER` in `src/platform/abilities.ts`.
- Sarvam docs (verify request/response shapes before coding):
  TTS https://docs.sarvam.ai/api-reference-docs/text-to-speech/api/rest-api ·
  STT https://docs.sarvam.ai/api-reference-docs/api-guides-tutorials/speech-to-text/rest-api

## 1. Server proxy (the key must never reach the browser)
Vercel functions at repo root (Edge runtime, `export const config = { runtime: 'edge' }`), key from
`process.env.SARVAM_API_KEY` (set in Vercel → Environment Variables; never `VITE_`-prefixed).
- `api/tts.ts`: **GET** `?text=&lang=en-IN|hi-IN&speaker=` → calls Sarvam text-to-speech (model `bulbul:v3`,
  header `api-subscription-key`), decodes the base64 WAV from `audios[0]`, returns `audio/wav` with
  `Cache-Control: public, max-age=31536000, s-maxage=31536000, immutable`. GET + that header lets Vercel's CDN cache
  every phrase once for all players, which keeps the Sarvam bill tiny. Validate: text ≤ 300 chars, lang allowlist,
  speaker allowlist (pick 2 pleasant voices from the docs: one per language).
- `api/stt.ts`: **POST** raw `audio/wav` body (≤ 10 s, ≤ 400 KB, else 413) + `?lang=` → forwards as multipart to
  Sarvam speech-to-text (model `saaras:v3`, mode `transcribe`, `language_code`), returns `{ transcript }`.
  No logging or storage of audio. Return 503 if the key is missing.

## 2. Client helper `src/platform/voice.ts` (games access it via the SDK below)
- `speak(text, lang)`: `fetch('/api/tts?...')` → decode with `ctx.audio.raw.decodeAudioData` → play through
  `ctx.audio.sfxOut` (so pause/volume/mute work). In-memory LRU cache of decoded buffers (keyed by text+lang).
  **Fallback:** if the request fails (local `vite dev` has no /api, offline, 503) use the existing Web Speech
  `ctx.audio.speak(text)`. Muted/preview mode → resolve immediately, no network.
- `listen(lang, maxMs = 6000)`: getUserMedia → Web Audio capture → encode **16 kHz mono 16-bit WAV** in JS
  (don't rely on MediaRecorder formats) → POST `/api/stt` → transcript. Stops early after ~1.2 s of silence
  (RMS threshold). Returns `null` on permission denied / failure.
- `prefetch(texts[], lang)`: warm the TTS cache for the next round.
- SDK: add optional `ctx.voice?: { speak; listen; prefetch; available(): 'full'|'tts-only'|'fallback' }` to
  `GameContext` (types.ts) and provide it in `src/runtime/host.ts`. In preview mode `speak`/`listen` resolve
  immediately and never touch the network or mic.

## 3. Microphone consent (required before any `listen`)
Platform sheet shown the first time a game calls `listen`: "Voice games send your recording to Sarvam AI to turn
speech into text. It isn't stored by Utopia. Allow microphone?" with **Allow** / **Type instead**. Remember the
choice (settings key `voiceInput: 'ask'|'mic'|'typing'`, plus a toggle in Settings → Gameplay). **Every mic game
must be fully playable by typing** (an on-screen text field replaces the mic button). Update the About page
privacy line to mention voice games use Sarvam AI only when you choose the mic.

## 4. The five games (Pixi, one folder each, portrait-safe layout, big tap targets, captions)
All: `lang` toggle **English / हिन्दी** in-game (persist via `ctx.storage`), always-visible caption of what was
spoken (toggleable for games where reading would give the answer away: show it after answering), relaxed timing
support, keyboard play, a ghost player in preview mode that plays with built-in text (no audio/network), and
`ctx.end()` after 2–3 minutes. Content: small curated word lists per language in each game's `content.ts`
(~60–120 items; child-safe). Manifest: `input.requiresAudio: true`, honest science note (no claims).

| # | id / Title | Ability (Ability type) | Loop | Mic? |
|---|---|---|---|---|
| 1 | `word-echo` / **Word Echo** | Auditory working memory (`working-memory`) | Hear a spoken list of 3→7 words; tap them in order from 6–9 tiles. Staircase on list length. Reverse-order rounds later. | No |
| 2 | `sound-sleuth` / **Sound Sleuth** | Auditory discrimination (`phonological-awareness`) | Hear two words (minimal pairs: cap/cat, ship/sip; Hindi pairs like कल/काल). Tap **Same** or **Different**; harder levels use closer pairs and faster pace. | No |
| 3 | `story-shells` / **Story Shells** | Listening comprehension (`sustained-attention`) | Hear a 2–4 sentence micro-story (pre-written, in content.ts); answer 2 questions with picture/word choices. Stories get longer. | No |
| 4 | `say-it-back` / **Say It Back** | Speech & phonology (`phonological-awareness`) | Hear a word/short phrase, then say it back (or type). Score by normalized similarity (Levenshtein on lowercased, punctuation-stripped transcript; Hindi compared in Devanagari). Longer phrases and tongue-twisters later. | Yes |
| 5 | `voice-sprint` / **Voice Sprint** | Verbal fluency (`cognitive-flexibility`) | A category appears and is spoken ("animals", "fruits", "things in a kitchen"). Name as many as you can in 40 s by speaking in short bursts (or typing); each transcript is split into words, matched against the category list (plus a lenient "accepted" list), duplicates ignored. Score = unique valid items. | Yes |

Visual direction: same editorial/luminous style as the rest (soft gradients, glow sprites, rounded cards,
Fraunces for big words). A calm pulsing "listening" ring when the mic is on; a waveform-ish glow while audio plays.

## 5. Feed + registry
Add the five ids to `EDITORIAL_ORDER` (interleave so no two adjacent share an ability ring). Capture posters
afterwards: `node scripts/capture-posters.mjs word-echo,sound-sleuth,story-shells,say-it-back,voice-sprint`
(dev server running). Update the About/hero game count automatically (it's computed).

## 6. Acceptance (keep it cheap)
- `npx tsc --noEmit` clean; `node scripts/smoke.mjs <each id> --play-ms=5000` with zero errors.
- Local dev has no `/api`, so the fallback path (Web Speech + typing) is what smoke tests exercise; that's expected.
- Commit + push. Then the owner adds `SARVAM_API_KEY` in Vercel and redeploys to activate real Sarvam voices.

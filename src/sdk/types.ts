// Public types for Utopia game authors. Games may import only from `@/sdk`.

export type Ability =
  | 'working-memory'
  | 'spatial-memory'
  | 'selective-attention'
  | 'sustained-attention'
  | 'divided-attention'
  | 'visual-processing'
  | 'spatial-reasoning'
  | 'pattern-recognition'
  | 'phonological-awareness'
  | 'reading-fluency'
  | 'cognitive-flexibility'
  | 'inhibition'
  | 'reaction-timing'
  | 'visuomotor-coordination'
  | 'planning'
  | 'rhythm-timing'
  | 'calm-attention';

export interface Palette {
  bg: string;
  bg2: string;
  accent: string;
  accent2: string;
  highlight: string;
}

export interface ResultStatDef {
  key: string;
  label: string;
  unit?: string;
  /** Used to decide whether a new value is a personal best for this stat. */
  better?: 'higher' | 'lower';
}

export interface GameManifest {
  id: string;
  version: string;
  title: string;
  /** ≤ 60 chars, shown on the feed card. */
  hook: string;
  description: string;
  /** 2–4 very short steps shown on first play and in "How to play". */
  howTo: string[];
  /** Key map shown in the info sheet, e.g. [['Space', 'Match']]. */
  controls: { touch: string; keyboard: Array<[string, string]> };
  abilities: { primary: Ability; secondary?: Ability[] };
  engine: 'r3f' | 'pixi' | 'canvas2d' | 'dom';
  energy: 'calm' | 'focused' | 'active';
  sessionLabel: string; // e.g. '~3 min'
  input: { requiresAudio: boolean; requiresFastReaction: boolean };
  accessibility: {
    relaxedTiming: boolean;
    noTimePressure: boolean;
    visualOnlyPlayable: boolean;
    audioOnlyPlayable: boolean;
    oneHanded: boolean;
    notes: string[];
  };
  palette: Palette;
  science: { paradigm: string; note: string; refs: string[] };
  scoreLabel: string; // unit for the score, e.g. 'points', 'pearls'
  /** Whether a higher score is better. Default true. Still Water sets `showScore: false`. */
  showScore?: boolean;
  results: ResultStatDef[];
  credits: string[];
}

export interface GameModule {
  manifest: GameManifest;
  load: () => Promise<{ default: GameFactory }>;
}

export type GameFactory = (ctx: GameContext) => GameInstance | Promise<GameInstance>;

export interface GameInstance {
  /** Called once when the player is ready (after the how-to card). In preview mode it is called immediately. */
  start(): void;
  /** Must free everything: GPU resources, DOM, listeners. ctx.signal is aborted right after. */
  destroy(): void;
  onPause?(): void;
  onResume?(): void;
  onSettings?(s: GameSettings): void;
}

export interface GameSettings {
  reducedMotion: boolean;
  highContrast: boolean;
  /** Multiply every response window / presentation duration by this (1, 1.5, 2). */
  timingMultiplier: number;
  /** Player asked for no time pressure (only meaningful where the game supports it). */
  noTimePressure: boolean;
  flashIntensity: 'normal' | 'reduced' | 'none';
  captions: boolean;
  showKeyHints: boolean;
  readingFont: 'default' | 'atkinson';
  textScale: number;
  leftHanded: boolean;
}

export interface QualityProfile {
  tier: 'low' | 'medium' | 'high';
  maxDpr: number;
  postFx: boolean;
  particleScale: number;
}

export interface Layout {
  width: number;
  height: number;
  /** Centered 9:16 rect where all gameplay-critical content must live. */
  safe: { x: number; y: number; w: number; h: number };
}

export interface HudState {
  score?: number;
  level?: number;
  lives?: number;
  maxLives?: number;
  /** Seconds remaining, shown as a timer. */
  timer?: number;
  /** 0..1 progress bar. */
  progress?: number;
  /** Short free-text label, e.g. "N = 2" or "Reverse!" */
  label?: string;
}

export interface SessionSummary {
  score: number;
  levelReached: number;
  /** Keyed by manifest.results[].key */
  stats: Record<string, number>;
  /** Short positive line; platform provides a default if omitted. */
  message?: string;
}

export interface Rng {
  next(): number; // [0,1)
  int(min: number, maxInclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
  chance(p: number): boolean;
}

export interface Staircase {
  readonly level: number;
  /** Record a trial outcome; returns the new level. */
  record(correct: boolean): number;
  set(level: number): void;
}

export type ToneShape = OscillatorType;

export interface ToneOptions {
  dur?: number; // seconds
  type?: ToneShape;
  gain?: number;
  attack?: number;
  release?: number;
  pan?: number; // -1..1
  when?: number; // AudioContext time; default now
  detune?: number;
  bus?: 'sfx' | 'music';
}

export interface GameAudio {
  /** Underlying context (for precise scheduling). May be null if audio is unavailable. */
  readonly raw: AudioContext | null;
  now(): number;
  /** Output latency estimate + user calibration, in seconds. */
  latency(): number;
  /** Frequency for a MIDI note number. */
  midi(note: number): number;
  /** Returns a function mapping scale degree (can be negative / > length) to frequency. */
  scale(rootMidi: number, mode?: 'majorPenta' | 'minorPenta' | 'major' | 'minor' | 'lydian'): (degree: number) => number;
  tone(freq: number, opts?: ToneOptions): void;
  pluck(freq: number, opts?: ToneOptions): void;
  bell(freq: number, opts?: ToneOptions): void;
  chime(freq: number, opts?: ToneOptions): void;
  /** Soft muted low "thunk" — used for errors (never harsh buzzers). */
  thunk(opts?: ToneOptions): void;
  /** Filtered noise burst: whoosh/splash/wind. */
  noise(opts?: ToneOptions & { filter?: number; q?: number; sweepTo?: number }): void;
  /** Small UI tick. */
  tick(): void;
  success(): void;
  error(): void;
  /** Start a soft generative ambient pad from chord MIDI notes. Returns stop fn. */
  ambient(chordMidi: number[], opts?: { gain?: number; brightness?: number }): () => void;
  /** Speak text with the Voice bus (Web Speech API). Resolves when done (or immediately if unsupported). */
  speak(text: string, opts?: { rate?: number; pitch?: number }): Promise<void>;
  /** Output node for custom synthesis (goes through this game's SFX bus). */
  readonly sfxOut: AudioNode | null;
  readonly musicOut: AudioNode | null;
}

export type VoiceLang = 'en-IN' | 'hi-IN';

export interface SpeakOptions {
  lang?: VoiceLang;
  /** Which voice: 'female' (default from settings) or 'male'. */
  voice?: 'female' | 'male';
  /** 0.6–1.6, default 1. */
  pace?: number;
  /** Stereo position -1 (left) … 1 (right). */
  pan?: number;
}

/**
 * Speech for voice games. Uses Sarvam AI (bulbul TTS / saaras STT) via the app's /api proxy, falling back to the
 * device voice (Web Speech) and to typing. In preview mode everything resolves immediately (no audio, no mic).
 */
export interface VoiceApi {
  /** Where speech comes from right now. 'none' = no audio possible (show captions). */
  source(): 'sarvam' | 'device' | 'none';
  /** Player's preferred language (from Settings; games may offer a toggle via setLang). */
  lang(): VoiceLang;
  setLang(l: VoiceLang): void;
  /** Speak text; resolves when playback ends (or immediately if unavailable). Several calls may overlap (e.g. with pan). */
  speak(text: string, opts?: SpeakOptions): Promise<void>;
  /** Warm the cache for upcoming phrases (no playback). */
  prefetch(texts: string[], opts?: SpeakOptions): void;
  /** Stop all speech from this game. */
  stop(): void;
  /** 'mic' or 'typing': asks the player once (privacy notice) the first time a game needs spoken answers. */
  inputMode(): Promise<'mic' | 'typing'>;
  /**
   * Record one spoken answer (stops after a short silence or maxMs) and return the transcript.
   * Returns '' if nothing was heard, null if the mic/transcription is unavailable (switch to typing).
   */
  listen(opts?: { lang?: VoiceLang; maxMs?: number; onLevel?: (level: number) => void }): Promise<string | null>;
}

export interface GameContext {
  readonly manifest: GameManifest;
  readonly container: HTMLElement;
  /** 'preview' = attract mode in the feed: play yourself with a ghost player, ignore input, never call end(). */
  readonly mode: 'play' | 'preview';
  readonly variant: 'normal' | 'daily';
  readonly seed: number;
  readonly rng: Rng;
  readonly settings: GameSettings; // live object, always current
  readonly quality: QualityProfile;
  readonly audio: GameAudio;
  /** Speech (TTS) and spoken answers (STT) for voice games. */
  readonly voice: VoiceApi;
  /** Suggested starting level from the player's history (1 for new players). */
  readonly startLevel: number;
  readonly signal: AbortSignal;

  layout(): Layout;
  onResize(cb: (l: Layout) => void): void;

  /** Pause-aware game time in ms (stops while paused). */
  time(): number;
  isPaused(): boolean;
  /** Pause-aware per-frame callback. Lower priority runs later (renderers use -100). */
  loop(cb: (dtMs: number, timeMs: number) => void, priority?: number): () => void;
  /** Pause-aware timeout. Returns cancel fn. */
  after(ms: number, cb: () => void): () => void;
  /** Pause-aware sleep. Never resolves after destroy. */
  wait(ms: number): Promise<void>;
  /** Keyboard handler map keyed by KeyboardEvent.code (e.g. 'Space', 'ArrowLeft', 'Digit1'). Ignored while paused / in preview. */
  keys(map: Record<string, (e: KeyboardEvent) => void>): void;

  hud: { set(patch: HudState): void; clear(): void };
  staircase(opts: { start?: number; min?: number; max?: number; up?: number; down?: number }): Staircase;
  storage: { get<T>(key: string, fallback: T): T; set<T>(key: string, value: T): void };
  haptics: { tick(): void; success(): void; error(): void };
  announce(text: string): void;
  /** Visual caption for a meaningful sound (shown when captions setting is on). */
  caption(text: string): void;
  /** Record a trial (kept locally for stats; never uploaded). */
  trial(t: { correct: boolean; rtMs?: number; level?: number }): void;
  /** Finish the session → platform shows the results screen. Ignored in preview mode. */
  end(summary: SessionSummary): void;
}

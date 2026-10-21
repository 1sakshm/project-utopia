// How each game scores, so stand-in opponents move like people do (see bots.ts). Taken from each game's scoring
// code (file:line references are in the comments) for a 60 s versus round that starts at level 1, with an average
// player's accuracy from the game's staircase rule.

export interface GameProfile {
  /** Points for one correct trial at level 1 (ignored when `outcomes` or `quadratic` is set). */
  points: number;
  /** Extra points per level above 1. */
  perLevel: number;
  /** Points = quadratic × (level + 1)², e.g. Lantern Lake's 5·(L+1)². */
  quadratic?: number;
  /** Correct trials pay one of these [points, probability] (e.g. grades, partial finds). */
  outcomes?: Array<[number, number]>;
  /** Missed trials pay one of these instead of nothing (partial credit). */
  missOutcomes?: Array<[number, number]>;
  /** ± random spread on points (speed bonuses). */
  jitter?: number;
  /** Score granularity. */
  step: number;
  /** Time between scoring opportunities for an average player: [min, mean, max] ms. */
  cadenceMs: [number, number, number];
  /** Share of trials an average player gets right. */
  accuracy: number;
  /** Correct answers in a row per level-up (Infinity = level never changes in a minute). */
  levelEveryCorrect: number;
  /** Earliest a real player can score after the start. */
  firstScoreMs: number;
  /** Additive streak bonus per consecutive correct (capped at streakCap). */
  streakBonus?: number;
  streakCap?: number;
  /** Multiplier 1 + floor(streak / every) × step, capped at cap. */
  streakMult?: { every: number; step: number; cap: number };
  /** Points lost on a miss, floored at 0. */
  missPenalty?: number;
  /** The run ends after this many misses (lives). */
  lives?: number;
  /** The run ends after this many trials (fixed sessions). */
  sessionTrials?: number;
  /** Stretches with no scoring at all (round breaks, intros): [from, to] ms. */
  quiet?: Array<[number, number]>;
  /** One-off chunks at fixed times: [t ms, min, max] points. */
  bonusAt?: Array<[number, number, number]>;
  /** The game shows the new score this long after the answer (celebration animation). */
  reportLagMs?: number;
  /** Trial length grows by this share per level. */
  levelSlowdown?: number;
  /** Accuracy drops by this much per level. */
  levelAccuracyDrop?: number;
}

export const PROFILES: Record<string, GameProfile> = {
  // logic.ts:12-35 len*10, len=L+2; 3 lives; up1/down1
  'echo-garden': { points: 30, perLevel: 10, step: 5, cadenceMs: [5200, 7600, 11000], accuracy: 0.62, levelEveryCorrect: 1, firstScoreMs: 4500, lives: 3 },
  // game.ts:305-377 catch 10–15, stop withheld +20, moth −15 / stop fail −10, own 40 s rounds
  'firefly-night': { points: 12, perLevel: 0, jitter: 2, outcomes: [[12, 0.85], [20, 0.15]], step: 1, cadenceMs: [700, 1300, 3200], accuracy: 0.79, levelEveryCorrect: 3, firstScoreMs: 1100, missPenalty: 12, quiet: [[40000, 43000]] },
  // game.ts:857-860 both right 100+14(L−1), one right 30
  glimpse: { points: 100, perLevel: 14, missOutcomes: [[30, 0.6], [0, 0.4]], step: 1, cadenceMs: [4400, 5700, 8000], accuracy: 0.76, levelEveryCorrect: 2, firstScoreMs: 4400 },
  // game.ts:424,629-641 100 × min(5, 1+floor(streak/3)); every trial ends in a find
  glyphfield: { points: 100, perLevel: 0, missOutcomes: [[100, 1]], streakMult: { every: 3, step: 1, cap: 5 }, step: 100, cadenceMs: [1500, 2600, 7000], accuracy: 0.79, levelEveryCorrect: 3, firstScoreMs: 1100, levelSlowdown: 0.06 },
  // logic.ts:20-30 5·(L+1)²; 3 lives
  'lantern-lake': { points: 20, perLevel: 0, quadratic: 5, step: 5, cadenceMs: [6500, 9500, 13000], accuracy: 0.75, levelEveryCorrect: 2, firstScoreMs: 3400, lives: 3 },
  // game.ts:681-682 first try 100, then 40/10/0; score shows ~1 s after the click
  loom: { points: 100, perLevel: 0, missOutcomes: [[40, 0.6], [10, 0.3], [0, 0.1]], step: 10, cadenceMs: [5500, 10000, 20000], accuracy: 0.75, levelEveryCorrect: 2, firstScoreMs: 3500, reportLagMs: 1000 },
  // game.tsx:346 60+40·stars+5·optimal; 5 chambers
  lumen: { points: 195, perLevel: 5, missOutcomes: [[155, 0.6], [115, 0.4]], step: 5, cadenceMs: [6000, 11000, 25000], accuracy: 0.6, levelEveryCorrect: 1, firstScoreMs: 3000, sessionTrials: 5 },
  // game.ts:436-438 got·10 + all-named bonus + speed; partial credit per item
  'name-rush': { points: 83, perLevel: 18, jitter: 12, missOutcomes: [[40, 0.7], [25, 0.3]], step: 1, cadenceMs: [6000, 7800, 11000], accuracy: 0.55, levelEveryCorrect: 1, firstScoreMs: 6000 },
  // game.ts:594-657 rejections +5 at ship exit, hits +50, false alarm −25, missed target −10
  'night-harbor': { points: 5, perLevel: 0, outcomes: [[5, 0.8], [50, 0.2]], step: 5, cadenceMs: [1500, 2800, 5500], accuracy: 0.9, levelEveryCorrect: 3, firstScoreMs: 7800, missPenalty: 15 },
  // game.ts:546-571 10 × harmony (1–4), harmony +1 per 3 in a row
  'orbit-keeper': { points: 10, perLevel: 0, streakMult: { every: 3, step: 1, cap: 4 }, step: 5, cadenceMs: [850, 1150, 1550], accuracy: 0.79, levelEveryCorrect: 3, firstScoreMs: 2400 },
  // game.tsx:201 10 × (1 + min(4, floor(streak/4))·0.5)
  'prism-sort': { points: 10, perLevel: 0, streakMult: { every: 4, step: 0.5, cap: 3 }, step: 5, cadenceMs: [1900, 2600, 4000], accuracy: 0.8, levelEveryCorrect: 4, firstScoreMs: 1950 },
  // logic.ts:146-149 25 per tagged fish found, all found doubles (2 tagged: 0/25/100)
  shoal: { points: 100, perLevel: 0, missOutcomes: [[25, 0.7], [0, 0.3]], step: 25, cadenceMs: [12000, 14000, 17000], accuracy: 0.7, levelEveryCorrect: 1, firstScoreMs: 10600 },
  // game.tsx:350-405 rotate 100/150/70, choice 150 or 0; 6 puzzles
  silhouette: { points: 150, perLevel: 0, outcomes: [[150, 0.6], [100, 0.4]], missOutcomes: [[70, 0.5], [0, 0.5]], step: 10, cadenceMs: [5000, 7500, 11000], accuracy: 0.75, levelEveryCorrect: 1, firstScoreMs: 2800, sessionTrials: 6 },
  // logic.ts:131-134 hit 10·N, false alarm −5; 6 targets in a minute, N stays 1
  starback: { points: 10, perLevel: 0, step: 5, cadenceMs: [6000, 9000, 13000], accuracy: 0.9, levelEveryCorrect: Infinity, firstScoreMs: 5700, missPenalty: 5 },
  // logic.ts:124-126 max(20, 100−10·extra) + 50 if perfect; 6 puzzles
  stonepath: { points: 150, perLevel: 0, missOutcomes: [[100, 0.4], [80, 0.3], [50, 0.3]], step: 10, cadenceMs: [6500, 10000, 16000], accuracy: 0.7, levelEveryCorrect: 1, firstScoreMs: 4600, sessionTrials: 6, reportLagMs: 600 },
  // game.ts:624-626 grades 100/70/40 × (1 + 0.05·streak); continuation chunk at ~34 s; round 2 from ~39.5 s
  'tidal-beat': { points: 100, perLevel: 0, outcomes: [[100, 0.5], [70, 0.35], [40, 0.15]], streakMult: { every: 1, step: 0.05, cap: 2 }, step: 1, cadenceMs: [700, 820, 950], accuracy: 0.79, levelEveryCorrect: 3, firstScoreMs: 4400, quiet: [[24000, 39500]], bonusAt: [[33900, 600, 1000]] },
  // game.ts:496-498 (10 + speed) × min(4, 1+floor(streak/5))
  upstream: { points: 16, perLevel: 0, jitter: 4, streakMult: { every: 5, step: 1, cap: 4 }, step: 1, cadenceMs: [1150, 1700, 2900], accuracy: 0.93, levelEveryCorrect: 3, firstScoreMs: 650 },
  // game.ts:440-441 10 × (1 + min(3, floor(streak/5))); 30-word rounds
  'word-current': { points: 10, perLevel: 0, streakMult: { every: 5, step: 1, cap: 4 }, step: 10, cadenceMs: [800, 1100, 2200], accuracy: 0.9, levelEveryCorrect: 3, firstScoreMs: 1600, quiet: [[33000, 35300]] },
  // game.tsx:151 grades 100/60/30 × combo multiplier; 3 lives
  zenith: { points: 100, perLevel: 0, outcomes: [[100, 0.6], [60, 0.3], [30, 0.1]], streakMult: { every: 5, step: 0.5, cap: 3 }, step: 5, cadenceMs: [1130, 1450, 3100], accuracy: 0.88, levelEveryCorrect: 3, firstScoreMs: 2500, lives: 3 },

  // Speech games: private rooms only (quick match never picks them).
  'digit-echo': { points: 30, perLevel: 10, missOutcomes: [[4, 0.5], [6, 0.5]], step: 1, cadenceMs: [6500, 9200, 13500], accuracy: 0.78, levelEveryCorrect: 2, firstScoreMs: 5900, lives: 3 },
  'lingo-switch': { points: 16, perLevel: 0, jitter: 5, streakBonus: 2, streakCap: 5, step: 1, cadenceMs: [2500, 3400, 7000], accuracy: 0.85, levelEveryCorrect: 2, firstScoreMs: 2100 },
  'luna-says': { points: 13, perLevel: 0, jitter: 2, step: 1, cadenceMs: [3000, 4000, 6500], accuracy: 0.85, levelEveryCorrect: 2, firstScoreMs: 4400 },
  'rhyme-tide': { points: 10, perLevel: 0, step: 2, cadenceMs: [3800, 5200, 8000], accuracy: 0.8, levelEveryCorrect: 2, firstScoreMs: 1800 },
  'say-it-back': { points: 20, perLevel: 20, missOutcomes: [[10, 0.5], [0, 0.5]], step: 5, cadenceMs: [5500, 7200, 11000], accuracy: 0.75, levelEveryCorrect: 2, firstScoreMs: 3800 },
  'sound-sleuth': { points: 10, perLevel: 10, streakBonus: 3, streakCap: 5, step: 1, cadenceMs: [4300, 5600, 8500], accuracy: 0.8, levelEveryCorrect: 2, firstScoreMs: 3900, reportLagMs: 520 },
  'story-shells': { points: 10, perLevel: 5, step: 5, cadenceMs: [1700, 7500, 18000], accuracy: 0.85, levelEveryCorrect: 2, firstScoreMs: 7800 },
  'two-voices': { points: 10, perLevel: 0, step: 5, cadenceMs: [5000, 5800, 7600], accuracy: 0.82, levelEveryCorrect: 2, firstScoreMs: 5800 },
  'voice-sprint': { points: 10, perLevel: 0, outcomes: [[10, 0.75], [20, 0.2], [30, 0.05]], step: 10, cadenceMs: [1800, 3500, 6500], accuracy: 0.85, levelEveryCorrect: Infinity, firstScoreMs: 6500, quiet: [[44000, 50000]] },
  'word-echo': { points: 30, perLevel: 10, step: 10, cadenceMs: [6500, 9500, 13000], accuracy: 0.75, levelEveryCorrect: 1, firstScoreMs: 5800, lives: 3 },
};

const DEFAULT: GameProfile = { points: 10, perLevel: 2, step: 5, cadenceMs: [1500, 2500, 4000], accuracy: 0.75, levelEveryCorrect: 2, firstScoreMs: 1500 };

export const profileFor = (gameId: string): GameProfile => PROFILES[gameId] ?? DEFAULT;

/** Games the always-live rooms rotate through: scored, no microphone needed (same rule as quick match). */
export const HOUSE_POOL: string[] = [
  'echo-garden', 'firefly-night', 'glimpse', 'glyphfield', 'lantern-lake', 'loom', 'lumen', 'name-rush', 'night-harbor', 'orbit-keeper',
  'prism-sort', 'shoal', 'silhouette', 'starback', 'stonepath', 'tidal-beat', 'upstream', 'word-current', 'zenith',
];

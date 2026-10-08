// Retention features backed by docs/YC_RESEARCH.md §2:
//  - "Today's 3": the same three games for everyone each day (UTC), finite, with a spoiler-free share card.
//  - Mastery stars (1–3) per game: the first star is earned just by finishing (endowed progress).
//  - "Up next": a suggestion from a different ability family, preferring games not yet played.
// Everything is derived from local progress; nothing new is stored except what progress already keeps.
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { createRng, hashString } from '@/sdk/rng';
import { ABILITY_RING, RINGS, type RingId } from './abilities';
import { useProgress, type GameProgress } from './progress';

export const utcToday = () => new Date().toISOString().slice(0, 10);

/** Ability glyph used in the share text (no colour-only meaning; each family has its own emoji). */
export const RING_EMOJI: Record<RingId, string> = {
  memory: '🌸',
  attention: '🔎',
  perception: '👁️',
  reasoning: '🧩',
  language: '🗣️',
  control: '🔀',
  timing: '🎵',
  calm: '🪷',
};

const ringOf = (id: string) => ABILITY_RING[GAME_BY_ID[id].manifest.abilities.primary];

/** Three games from three different ability families, identical for everyone on a given UTC day. */
export function todayTrio(day = utcToday()): string[] {
  const rng = createRng(hashString('trio:' + day));
  const pool = rng.shuffle(GAMES.map((g) => g.manifest.id).filter((id) => GAME_BY_ID[id].manifest.showScore !== false));
  const out: string[] = [];
  for (const id of pool) {
    if (out.length === 3) break;
    if (!out.some((o) => ringOf(o) === ringOf(id))) out.push(id);
  }
  return out;
}

export interface TrioStatus {
  day: string;
  ids: string[];
  done: boolean[];
  scores: number[];
  count: number;
  complete: boolean;
}

export function trioStatus(games: Record<string, GameProgress> = useProgress.getState().games, day = utcToday()): TrioStatus {
  const ids = todayTrio(day);
  const scores = ids.map((id) => (games[id]?.dailyBest?.day === day ? games[id]!.dailyBest!.score : -1));
  const done = scores.map((s) => s >= 0);
  const count = done.filter(Boolean).length;
  return { day, ids, done, scores, count, complete: count === ids.length };
}

/** Mastery stars 0–3. Calm games (no score) earn stars by returning; others by the highest level reached. */
export function starsFor(id: string, p: GameProgress | undefined): number {
  if (!p || p.sessions === 0) return 0;
  const m = GAME_BY_ID[id]?.manifest;
  if (!m) return 0;
  if (m.showScore === false) return p.sessions >= 7 ? 3 : p.sessions >= 3 ? 2 : 1;
  return p.highestLevel >= 7 ? 3 : p.highestLevel >= 4 ? 2 : 1;
}

export const STAR_HINT = (id: string) =>
  GAME_BY_ID[id]?.manifest.showScore === false ? 'Stars: play once, 3 times, 7 times' : 'Stars: finish a round, reach level 4, reach level 7';

export const starText = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);

/** Stars per ability family, for the Progress page. */
export function starsByRing(games: Record<string, GameProgress>) {
  return RINGS.map((r) => {
    const ids = GAMES.filter((g) => ABILITY_RING[g.manifest.abilities.primary] === r.id).map((g) => g.manifest.id);
    return { ring: r, earned: ids.reduce((n, id) => n + starsFor(id, games[id]), 0), max: ids.length * 3 };
  });
}

/** A different-ability suggestion: unplayed games first, then the least played. Stable for a given state. */
export function nextUp(currentId: string, games: Record<string, GameProgress> = useProgress.getState().games): string | null {
  const ring = GAME_BY_ID[currentId] ? ringOf(currentId) : null;
  const candidates = GAMES.map((g) => g.manifest.id).filter((id) => id !== currentId && ringOf(id) !== ring);
  if (!candidates.length) return null;
  const salt = hashString(currentId + ':' + utcToday());
  return candidates
    .map((id) => ({ id, s: (games[id]?.sessions ?? 0) * 100 + (hashString(id) ^ salt) % 97 }))
    .sort((a, b) => a.s - b.s)[0].id;
}

/** Spoiler-free share text for today's challenge. */
export function shareText(st: TrioStatus): string {
  const date = new Date(st.day + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const lines = st.ids.map((id, i) => {
    const m = GAME_BY_ID[id].manifest;
    return `${RING_EMOJI[ringOf(id)]} ${m.title}: ${st.done[i] ? st.scores[i].toLocaleString('en-US') : '…'}`;
  });
  return [`Project Utopia · Today's 3 · ${date}`, ...lines, '', 'Play today’s games: https://playutopia.pages.dev/?utm_source=share'].join('\n');
}

/** This week's rhythm (Mon–Sun, local time): which days had at least one finished game. */
export function weekRhythm(history: Array<{ t: number; ms: number }>, goal: number, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  const played = Array.from({ length: 7 }, (_, i) => {
    const a = start.getTime() + i * 864e5;
    return history.some((h) => h.t + h.ms >= a && h.t + h.ms < a + 864e5);
  });
  const todayIdx = (now.getDay() + 6) % 7;
  const days = played.filter(Boolean).length;
  const restLeft = Math.max(0, 7 - goal - played.slice(0, todayIdx).filter((p) => !p).length);
  return { played, todayIdx, days, goal, met: goal > 0 && days >= goal, restLeft };
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * Daily streak with a built-in freeze: one missed day per 7 is forgiven automatically (an "emergency reserve",
 * which research links to more persistence after a miss; see docs/YC_PLAN.md §2.2). Today never breaks a streak:
 * if you haven't played yet, it's still alive until midnight.
 */
export function computeStreak(history: Array<{ t: number; ms: number }>, now = new Date()) {
  const played = new Set(history.map((h) => dayKey(new Date(h.t + h.ms))));
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  const playedToday = played.has(dayKey(day));
  let days = 0;
  let lastFreeze = -99; // index (days back) of the last freeze used
  let freezeUsedThisWeek = false;
  for (let i = 0; i < 400; i++) {
    const d = new Date(day);
    d.setDate(day.getDate() - i);
    if (played.has(dayKey(d))) {
      days++;
      continue;
    }
    if (i === 0) continue; // today isn't over yet
    if (days > 0 && i - lastFreeze >= 7 && played.has(dayKey(new Date(d.getTime() - 864e5)))) {
      lastFreeze = i;
      if (i < 7) freezeUsedThisWeek = true;
      continue;
    }
    break;
  }
  const week = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(day);
    d.setDate(day.getDate() - (6 - k));
    return { label: 'SMTWTFS'[d.getDay()], played: played.has(dayKey(d)), today: k === 6 };
  });
  return { days, playedToday, freezeReady: !freezeUsedThisWeek, week };
}

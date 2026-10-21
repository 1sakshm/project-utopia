// Growth: what the staircase levels say about a player over time. Every adaptive game holds the player near a fixed
// accuracy (docs/paper, §3), so the level a session reaches is a direct estimate of their threshold on that game.
// A rising level is real progress on that game; it is not a claim about anything beyond the game.
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { ABILITY_RING, RINGS, type RingId } from './abilities';
import type { SessionRecord } from './progress';

export interface FamilyGrowth {
  ring: (typeof RINGS)[number];
  /** Adaptive games in this family the player has finished at least once. */
  games: number;
  sessions: number;
  /** Mean change in level per game, first session → recent best (levels). null when nothing adaptive was played. */
  gain: number | null;
  /** The same over the last 30 days only (null with fewer than two sessions of one game in the window). */
  monthGain: number | null;
  /** Gain over time, one point per session (oldest first, last 24), for a sparkline. */
  series: number[];
}

const MONTH = 30 * 864e5;
const RECENT = 3; // a game's current level = best of its last 3 sessions (one bad day shouldn't erase progress)

const adaptive = (gameId: string) => GAME_BY_ID[gameId]?.manifest.showScore !== false;

/** Sessions that count: finished, unassisted, adaptive games with a level. Oldest first. */
function usable(history: SessionRecord[]) {
  return history.filter((h) => !h.assisted && h.level > 0 && adaptive(h.gameId)).sort((a, b) => a.t - b.t);
}

const current = (levels: number[]) => Math.max(...levels.slice(-RECENT));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function growthByFamily(history: SessionRecord[], now = Date.now()): FamilyGrowth[] {
  const byGame = new Map<string, SessionRecord[]>();
  for (const h of usable(history)) {
    if (!byGame.has(h.gameId)) byGame.set(h.gameId, []);
    byGame.get(h.gameId)!.push(h);
  }
  return RINGS.map((ring) => {
    const ids = [...byGame.keys()].filter((id) => ABILITY_RING[GAME_BY_ID[id].manifest.abilities.primary] === ring.id);
    const gains: number[] = [];
    const monthGains: number[] = [];
    const points: Array<{ id: string; t: number; g: number }> = [];
    let sessions = 0;
    for (const id of ids) {
      const s = byGame.get(id)!;
      sessions += s.length;
      const base = s[0].level;
      const levels = s.map((x) => x.level);
      if (s.length >= 2) gains.push(current(levels) - base);
      const inMonth = s.filter((x) => x.t >= now - MONTH);
      const before = s.filter((x) => x.t < now - MONTH);
      // Start of the window: where the player was just before it, else their first session inside it.
      const start = before.length ? current(before.map((x) => x.level)) : inMonth[0]?.level;
      if (inMonth.length >= (before.length ? 1 : 2) && start !== undefined) monthGains.push(current(inMonth.map((x) => x.level)) - start);
      s.forEach((x, i) => points.push({ id, t: x.t, g: current(levels.slice(0, i + 1)) - base }));
    }
    // Running family mean of each game's latest gain, so starting a new game doesn't read as a drop.
    const latest = new Map<string, number>();
    const series = points
      .sort((a, b) => a.t - b.t)
      .map((p) => {
        latest.set(p.id, p.g);
        return mean([...latest.values()]);
      });
    return {
      ring,
      games: ids.length,
      sessions,
      gain: gains.length ? mean(gains) : null,
      monthGain: monthGains.length ? mean(monthGains) : null,
      series: series.slice(-24),
    };
  });
}

/** Families with no adaptive game (Calm) are reported by sessions only. */
export const familyIsAdaptive = (ring: RingId) => GAMES.some((g) => ABILITY_RING[g.manifest.abilities.primary] === ring && adaptive(g.manifest.id));

export function gainText(g: number) {
  const r = Math.round(g * 10) / 10;
  if (Math.abs(r) < 0.1) return 'steady';
  const n = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1);
  return `${r > 0 ? 'up' : 'down'} ${n} level${Math.abs(r) === 1 ? '' : 's'}`;
}

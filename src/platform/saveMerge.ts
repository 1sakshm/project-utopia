// Cloud-save document and the merge used when two devices changed progress at the same time.
// Pure functions (no stores) so they're easy to test.
import type { GameProgress, SessionRecord } from './progress';

export const SAVE_SCHEMA = 1;
const HISTORY_CAP = 600;

export interface EconomySnap {
  orbs: number;
  xp: number;
  owned: string[];
  sampled: string[];
  equipped: { skin: string; theme: string };
  boosts: { slowmo: number; secondWind: number };
  quests: { day: string; list: Array<{ id: string; progress: number; claimed: boolean }> };
  ads: { day: string; count: number };
}

export interface SaveDoc {
  schema: number;
  savedAt: number;
  progress: { games: Record<string, GameProgress>; history: SessionRecord[] };
  economy: EconomySnap;
  settings: Record<string, unknown>;
}

const union = (a: string[] = [], b: string[] = []) => [...new Set([...a, ...b])];

function mergeGame(a: GameProgress, b: GameProgress): GameProgress {
  const newer = (b.lastPlayed ?? 0) > (a.lastPlayed ?? 0) ? b : a;
  const dailyBest =
    !a.dailyBest || !b.dailyBest
      ? (a.dailyBest ?? b.dailyBest)
      : a.dailyBest.day === b.dailyBest.day
        ? { day: a.dailyBest.day, score: Math.max(a.dailyBest.score, b.dailyBest.score) }
        : a.dailyBest.day > b.dailyBest.day
          ? a.dailyBest
          : b.dailyBest;
  return {
    ...newer,
    best: Math.max(a.best ?? 0, b.best ?? 0),
    bestRelaxed: Math.max(a.bestRelaxed ?? 0, b.bestRelaxed ?? 0),
    bestAssisted: Math.max(a.bestAssisted ?? 0, b.bestAssisted ?? 0),
    highestLevel: Math.max(a.highestLevel ?? 0, b.highestLevel ?? 0),
    sessions: Math.max(a.sessions ?? 0, b.sessions ?? 0),
    playMs: Math.max(a.playMs ?? 0, b.playMs ?? 0),
    tutorialDone: !!(a.tutorialDone || b.tutorialDone),
    lastPlayed: Math.max(a.lastPlayed ?? 0, b.lastPlayed ?? 0),
    favorite: newer.favorite,
    dailyBest,
    bestStats: { ...(newer === a ? b : a).bestStats, ...newer.bestStats },
  };
}

/**
 * Both sides changed since the last sync: keep the best of each. Bests, levels and unlocks never go backwards;
 * history is combined; orbs/xp take the higher value (so nothing earned is lost on either device).
 */
export function mergeSaves(local: SaveDoc, remote: SaveDoc): SaveDoc {
  const games: Record<string, GameProgress> = { ...remote.progress.games };
  for (const [id, g] of Object.entries(local.progress.games)) games[id] = games[id] ? mergeGame(g, games[id]) : g;

  const seen = new Set<string>();
  const history = [...local.progress.history, ...remote.progress.history]
    .filter((h) => (seen.has(h.id) ? false : (seen.add(h.id), true)))
    .sort((x, y) => y.t - x.t)
    .slice(0, HISTORY_CAP);

  const le = local.economy;
  const re = remote.economy;
  const quests =
    le.quests.day === re.quests.day
      ? {
          day: le.quests.day,
          list: le.quests.list.map((q) => {
            const o = re.quests.list.find((x) => x.id === q.id);
            return o ? { ...q, progress: Math.max(q.progress, o.progress), claimed: q.claimed || o.claimed } : q;
          }),
        }
      : le.quests.day > re.quests.day
        ? le.quests
        : re.quests;

  return {
    schema: SAVE_SCHEMA,
    savedAt: Math.max(local.savedAt, remote.savedAt),
    progress: { games, history },
    economy: {
      orbs: Math.max(le.orbs, re.orbs),
      xp: Math.max(le.xp, re.xp),
      owned: union(le.owned, re.owned),
      sampled: union(le.sampled, re.sampled),
      equipped: local.savedAt >= remote.savedAt ? le.equipped : re.equipped,
      boosts: { slowmo: Math.max(le.boosts.slowmo, re.boosts.slowmo), secondWind: Math.max(le.boosts.secondWind, re.boosts.secondWind) },
      quests,
      ads: le.ads.day === re.ads.day ? { day: le.ads.day, count: Math.max(le.ads.count, re.ads.count) } : le.ads.day > re.ads.day ? le.ads : re.ads,
    },
    settings: local.savedAt >= remote.savedAt ? { ...remote.settings, ...local.settings } : { ...local.settings, ...remote.settings },
  };
}

/** Is there anything worth keeping in this save? (A brand-new guest has nothing to merge.) */
export function hasProgress(d: SaveDoc): boolean {
  return d.progress.history.length > 0 || Object.values(d.progress.games).some((g) => g.sessions > 0) || d.economy.xp > 0;
}

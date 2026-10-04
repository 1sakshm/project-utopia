import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';

export interface SessionRecord {
  id: string;
  gameId: string;
  t: number; // epoch ms (start)
  ms: number; // duration
  score: number;
  level: number;
  mode: 'normal' | 'daily';
  timing: string;
  stats: Record<string, number>;
  /** Boosted or revived run (kept out of normal personal bests). */
  assisted?: boolean;
}

export interface GameProgress {
  best: number;
  bestRelaxed: number;
  /** Best score from boosted/revived runs (never overwrites `best`). */
  bestAssisted?: number;
  bestStats: Record<string, number>;
  highestLevel: number;
  lastLevel: number;
  sessions: number;
  playMs: number;
  tutorialDone: boolean;
  lastPlayed: number;
  favorite: boolean;
  earlyExits: number;
  dailyBest: { day: string; score: number } | null;
  storage: Record<string, unknown>;
}

export const emptyProgress = (): GameProgress => ({
  best: 0,
  bestRelaxed: 0,
  bestStats: {},
  highestLevel: 0,
  lastLevel: 0,
  sessions: 0,
  playMs: 0,
  tutorialDone: false,
  lastPlayed: 0,
  favorite: false,
  earlyExits: 0,
  dailyBest: null,
  storage: {},
});

interface ProgressStore {
  games: Record<string, GameProgress>;
  history: SessionRecord[]; // newest first, capped
  get: (id: string) => GameProgress;
  patch: (id: string, p: Partial<GameProgress>) => void;
  addSession: (r: SessionRecord) => void;
  toggleFavorite: (id: string) => void;
  clearAll: () => void;
}

const HISTORY_CAP = 600;

export const useProgress = create<ProgressStore>()(
  persist(
    (set, get) => ({
      games: {},
      history: [],
      get: (id) => get().games[id] ?? emptyProgress(),
      patch: (id, p) =>
        set((s) => ({ games: { ...s.games, [id]: { ...(s.games[id] ?? emptyProgress()), ...p } } })),
      addSession: (r) => set((s) => ({ history: [r, ...s.history].slice(0, HISTORY_CAP) })),
      toggleFavorite: (id) => {
        const g = get().get(id);
        get().patch(id, { favorite: !g.favorite });
      },
      clearAll: () => set({ games: {}, history: [] }),
    }),
    { name: 'utopia.progress', version: 1, storage: safeJSONStorage() },
  ),
);

/** Suggested start level: a little below the last level reached (warm-up). */
/**
 * Where a run starts: a little below last time. Coming back after a break eases in further, because players at
 * risk of churning stay longer when early levels are easier (Ascarza et al. 2025; see docs/YC_PLAN.md §2.2).
 */
export function startLevelFor(id: string, now = Date.now()): number {
  const g = useProgress.getState().get(id);
  const daysAway = g.lastPlayed ? (now - g.lastPlayed) / 864e5 : 0;
  const ease = daysAway >= 14 ? 4 : daysAway >= 3 ? 3 : 2;
  return Math.max(1, (g.lastLevel || 1) - ease);
}

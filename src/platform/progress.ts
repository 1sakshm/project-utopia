import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
}

export interface GameProgress {
  best: number;
  bestRelaxed: number;
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
    { name: 'utopia.progress', version: 1 },
  ),
);

/** Suggested start level: a little below the last level reached (warm-up). */
export function startLevelFor(id: string): number {
  const g = useProgress.getState().get(id);
  return Math.max(1, (g.lastLevel || 1) - 2);
}

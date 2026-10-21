// Starter check: one short game from each adaptive family, so a new player's staircases start near their own level
// (every later session starts from the last level reached; see startLevelFor) and the Growth view has a baseline
// for every family. It can be paused and resumed; games already played count as done.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GAMES } from '@/games/registry';
import { ABILITY_RING, RINGS } from './abilities';
import { useProgress, type GameProgress } from './progress';
import { safeJSONStorage } from './safeStorage';

const minutes = (label: string) => Number(label.match(/[\d.]+/)?.[0] ?? 3) / (label.includes(' s') ? 60 : 1);

/** Shortest adaptive game per family, preferring games that need no microphone. Calm has no levels, so it's skipped. */
export const STARTER_IDS: string[] = RINGS.flatMap((r) => {
  const pool = GAMES.map((g) => g.manifest).filter((m) => ABILITY_RING[m.abilities.primary] === r.id && m.showScore !== false);
  pool.sort((a, b) => Number(a.input.requiresAudio) - Number(b.input.requiresAudio) || minutes(a.sessionLabel) - minutes(b.sessionLabel));
  return pool.length ? [pool[0].id] : [];
});

export const STARTER_MINUTES = Math.round(STARTER_IDS.reduce((n, id) => n + minutes(GAMES.find((g) => g.manifest.id === id)!.manifest.sessionLabel), 0));

interface StarterStore {
  active: boolean;
  dismissed: boolean;
  start: () => void;
  stop: () => void;
  dismiss: () => void;
}

export const useStarter = create<StarterStore>()(
  persist(
    (set) => ({
      active: false,
      dismissed: false,
      start: () => set({ active: true, dismissed: false }),
      stop: () => set({ active: false }),
      dismiss: () => set({ active: false, dismissed: true }),
    }),
    { name: 'utopia.starter', version: 1, storage: safeJSONStorage() },
  ),
);

export interface StarterStatus {
  ids: string[];
  done: boolean[];
  count: number;
  complete: boolean;
  next: string | null;
}

const familyOf = (id: string) => ABILITY_RING[GAMES.find((g) => g.manifest.id === id)!.manifest.abilities.primary];

/** A family counts as done once any adaptive game in it has been finished, so nobody is sent back to a family they know. */
export function starterStatus(games: Record<string, GameProgress> = useProgress.getState().games): StarterStatus {
  const played = new Set(
    GAMES.filter((g) => g.manifest.showScore !== false && (games[g.manifest.id]?.sessions ?? 0) > 0).map((g) => ABILITY_RING[g.manifest.abilities.primary]),
  );
  const done = STARTER_IDS.map((id) => played.has(familyOf(id)));
  const count = done.filter(Boolean).length;
  const i = done.indexOf(false);
  return { ids: STARTER_IDS, done, count, complete: i < 0, next: i < 0 ? null : STARTER_IDS[i] };
}

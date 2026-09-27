import { create } from 'zustand';
import { GAMES, GAME_BY_ID } from '@/games/registry';
import { ABILITY_RING } from './abilities';
import { useProgress } from './progress';
import { useSettings } from './settings';

export type FeedItem =
  | { key: string; type: 'game'; gameId: string; variant: 'normal' | 'daily'; cycle: number }
  | { key: string; type: 'end'; cycle: number };

const ringOfId = (id: string) => ABILITY_RING[GAME_BY_ID[id].manifest.abilities.primary];

/** Deterministic, transparent ordering (PRD §6.4). */
export function computeOrder(): string[] {
  const progress = useProgress.getState();
  const s = useSettings.getState();
  const scored = GAMES.map((g, i) => {
    const m = g.manifest;
    const p = progress.get(m.id);
    let score = i;
    if (p.sessions === 0) score -= 3;
    if (p.earlyExits >= 2) score += 6;
    if (p.favorite && i >= 8) score = Math.min(score, 5);
    if (s.hideFastReaction && m.input.requiresFastReaction) score += 100;
    if (s.hideAudioDependent && m.input.requiresAudio) score += 100;
    return { id: m.id, score: score + i * 0.001 };
  }).sort((a, b) => a.score - b.score);
  const order = scored.map((x) => x.id);
  // Never place two games of the same ability category adjacently.
  for (let i = 1; i < order.length; i++) {
    if (ringOfId(order[i]) === ringOfId(order[i - 1])) {
      const j = order.findIndex((id, k) => k > i && ringOfId(id) !== ringOfId(order[i - 1]));
      if (j > i) [order[i], order[j]] = [order[j], order[i]];
    }
  }
  return order;
}

function buildItems(order: string[]): FeedItem[] {
  const items: FeedItem[] = [];
  order.forEach((id) => items.push({ key: `0:${id}`, type: 'game', gameId: id, variant: 'normal', cycle: 0 }));
  items.push({ key: 'end:0', type: 'end', cycle: 0 });
  order.forEach((id) => items.push({ key: `1:${id}`, type: 'game', gameId: id, variant: 'daily', cycle: 1 }));
  items.push({ key: 'end:1', type: 'end', cycle: 1 });
  return items;
}

interface FeedState {
  order: string[];
  items: FeedItem[];
  activeIndex: number;
  setActive: (i: number) => void;
  /** Request the feed to scroll to an index (consumed by the Feed component). */
  scrollRequest: { index: number; smooth: boolean; n: number } | null;
  requestScroll: (index: number, smooth?: boolean) => void;
}

const SS_KEY = 'utopia.feed';

function initial(): { order: string[]; activeIndex: number } {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as { order: string[]; activeIndex: number };
      if (Array.isArray(v.order) && v.order.length === GAMES.length && v.order.every((id) => GAME_BY_ID[id])) return v;
    }
  } catch {
    /* ignore */
  }
  return { order: computeOrder(), activeIndex: 0 };
}

const init = initial();

export const useFeed = create<FeedState>((set, get) => ({
  order: init.order,
  items: buildItems(init.order),
  activeIndex: init.activeIndex,
  setActive: (i) => {
    if (i === get().activeIndex) return;
    set({ activeIndex: i });
    sessionStorage.setItem(SS_KEY, JSON.stringify({ order: get().order, activeIndex: i }));
  },
  scrollRequest: null,
  requestScroll: (index, smooth = true) => set((s) => ({ scrollRequest: { index, smooth, n: (s.scrollRequest?.n ?? 0) + 1 } })),
}));

export function indexOfGame(id: string, variant: 'normal' | 'daily' = 'normal'): number {
  return useFeed.getState().items.findIndex((it) => it.type === 'game' && it.gameId === id && it.variant === variant);
}

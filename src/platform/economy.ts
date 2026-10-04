// Gamification economy: orbs (soft currency), XP/levels, daily quests, cosmetics, boosts, ad caps.
// Local-first (persisted to localStorage). No real money anywhere.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './safeStorage';
import { createRng, hashString } from '@/sdk/rng';
import type { RingId } from './abilities';
import { RINGS } from './abilities';
import { ADS_ENABLED } from './adsConfig';
import { DEFAULT_OWNED, ITEM_BY_ID, PACKS, type PackDef } from './shop';

export const AD_DAILY_CAP = 12;

export type QuestKind = 'family' | 'variety' | 'level' | 'best' | 'voice' | 'sessions';
export interface Quest {
  id: string;
  kind: QuestKind;
  title: string;
  target: number;
  progress: number;
  reward: number;
  xp: number;
  /** For 'family' quests: which ability family. For 'level': the level to reach. */
  ring?: RingId;
  level?: number;
  /** Game ids already counted today (variety quests). */
  seen?: string[];
  claimed: boolean;
}

export interface SessionFacts {
  gameId: string;
  ring: RingId;
  voice: boolean; // a voice (audio) game
  levelReached: number;
  completed: boolean;
  isPb: boolean;
  assisted: boolean;
  ms: number;
}

export interface SessionRewards {
  orbs: number;
  xp: number;
  levelBefore: number;
  levelAfter: number;
  questsCompleted: Quest[];
}

export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
export const levelFor = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 60)) + 1;
export const xpForLevel = (level: number) => 60 * (level - 1) ** 2;
/** 0..1 progress from the current level to the next. */
export function levelProgress(xp: number) {
  const l = levelFor(xp);
  const a = xpForLevel(l);
  const b = xpForLevel(l + 1);
  return { level: l, into: xp - a, span: b - a, frac: (xp - a) / (b - a) };
}

/** Deterministic set of 3 quests for a day (same for everyone that day). */
export function questsFor(day: string): Quest[] {
  const rng = createRng(hashString('quests:' + day));
  const ring = rng.pick(RINGS.filter((r) => r.id !== 'calm'));
  const level = rng.int(4, 6);
  const pool: Array<() => Quest> = [
    () => ({ id: 'family', kind: 'family', title: `Play 2 ${ring.label} games`, target: 2, progress: 0, reward: 30, xp: 50, ring: ring.id, claimed: false }),
    () => ({ id: 'variety', kind: 'variety', title: 'Try 3 different games', target: 3, progress: 0, reward: 35, xp: 50, seen: [], claimed: false }),
    () => ({ id: 'level', kind: 'level', title: `Reach level ${level} in any game`, target: 1, progress: 0, reward: 30, xp: 50, level, claimed: false }),
    () => ({ id: 'best', kind: 'best', title: 'Beat one of your personal bests', target: 1, progress: 0, reward: 40, xp: 60, claimed: false }),
    () => ({ id: 'voice', kind: 'voice', title: 'Play 2 voice games', target: 2, progress: 0, reward: 30, xp: 50, claimed: false }),
    () => ({ id: 'sessions', kind: 'sessions', title: 'Finish 4 sessions', target: 4, progress: 0, reward: 25, xp: 40, claimed: false }),
  ];
  return rng.shuffle(pool.slice()).slice(0, 3).map((f) => f());
}

/** Orbs + XP for a finished session. Assisted (boosted/revived) runs earn half orbs, full XP. */
export function sessionReward(f: Pick<SessionFacts, 'levelReached' | 'completed' | 'assisted' | 'ms'>) {
  const base = 8 + Math.min(30, Math.max(0, f.levelReached) * 3) + (f.completed ? 5 : 0);
  const orbs = f.assisted ? Math.round(base / 2) : base;
  const xp = 25 + Math.max(0, f.levelReached) * 6 + Math.round((f.ms / 60000) * 10);
  return { orbs, xp };
}

function advanceQuest(q: Quest, f: SessionFacts): Quest {
  if (q.claimed || q.progress >= q.target) return q;
  const n = { ...q };
  switch (q.kind) {
    case 'family':
      if (f.ring === q.ring) n.progress++;
      break;
    case 'variety':
      if (!q.seen?.includes(f.gameId)) {
        n.seen = [...(q.seen ?? []), f.gameId];
        n.progress = n.seen.length;
      }
      break;
    case 'level':
      if (f.levelReached >= (q.level ?? 99)) n.progress = 1;
      break;
    case 'best':
      if (f.isPb) n.progress = 1;
      break;
    case 'voice':
      if (f.voice) n.progress++;
      break;
    case 'sessions':
      n.progress++;
      break;
  }
  n.progress = Math.min(n.target, n.progress);
  return n;
}

interface EconomyState {
  orbs: number;
  xp: number;
  owned: string[];
  sampled: string[]; // cosmetics unlocked via a one-time ad sample
  equipped: { skin: string; theme: string };
  boosts: { slowmo: number; secondWind: number };
  quests: { day: string; list: Quest[] };
  ads: { day: string; count: number };

  /** Current day's quests (regenerates on a new UTC day). */
  todayQuests(): Quest[];
  applySession(f: SessionFacts): SessionRewards;
  claimQuest(id: string): number;
  award(orbs: number, xp?: number): void;
  spend(orbs: number): boolean;
  canWatchAd(): boolean;
  adsLeft(): number;
  noteAd(): void;
  buy(id: string): boolean;
  unlockSample(id: string): void;
  equip(id: string): void;
  useBoost(kind: 'slowmo' | 'secondWind'): boolean;
  reset(): void;
}

const initial = () => ({
  orbs: 50, // a small welcome gift
  xp: 0,
  owned: [...DEFAULT_OWNED],
  sampled: [] as string[],
  equipped: { skin: 'skin-aurora', theme: 'theme-aurora' },
  boosts: { slowmo: 1, secondWind: 1 }, // one of each to try
  quests: { day: '', list: [] as Quest[] },
  ads: { day: '', count: 0 },
});

export const useEconomy = create<EconomyState>()(
  persist(
    (set, get) => ({
      ...initial(),
      todayQuests() {
        const day = utcDay();
        const q = get().quests;
        if (q.day === day) return q.list;
        const list = questsFor(day);
        set({ quests: { day, list } });
        return list;
      },
      applySession(f) {
        const s = get();
        const levelBefore = levelFor(s.xp);
        const { orbs, xp } = sessionReward(f);
        const before = s.todayQuests();
        const after = before.map((q) => advanceQuest(q, f));
        const questsCompleted = after.filter((q, i) => q.progress >= q.target && before[i].progress < before[i].target);
        set({ orbs: s.orbs + orbs, xp: s.xp + xp, quests: { day: utcDay(), list: after } });
        return { orbs, xp, levelBefore, levelAfter: levelFor(s.xp + xp), questsCompleted };
      },
      claimQuest(id) {
        const s = get();
        const list = s.todayQuests();
        const q = list.find((x) => x.id === id);
        if (!q || q.claimed || q.progress < q.target) return 0;
        set({
          orbs: s.orbs + q.reward,
          xp: s.xp + q.xp,
          quests: { day: utcDay(), list: list.map((x) => (x.id === id ? { ...x, claimed: true } : x)) },
        });
        return q.reward;
      },
      award(orbs, xp = 0) {
        set((s) => ({ orbs: s.orbs + Math.max(0, orbs), xp: s.xp + Math.max(0, xp) }));
      },
      spend(orbs) {
        const s = get();
        if (orbs < 0 || s.orbs < orbs) return false;
        set({ orbs: s.orbs - orbs });
        return true;
      },
      canWatchAd() {
        if (!ADS_ENABLED) return false;
        const a = get().ads;
        return a.day !== utcDay() || a.count < AD_DAILY_CAP;
      },
      adsLeft() {
        const a = get().ads;
        return a.day !== utcDay() ? AD_DAILY_CAP : Math.max(0, AD_DAILY_CAP - a.count);
      },
      noteAd() {
        const a = get().ads;
        const day = utcDay();
        set({ ads: { day, count: (a.day === day ? a.count : 0) + 1 } });
      },
      buy(id) {
        const item = ITEM_BY_ID[id];
        const s = get();
        if (!item) return false;
        if (item.kind !== 'pack' && s.owned.includes(id)) return false;
        if (!get().spend(item.price)) return false;
        if (item.kind === 'pack') {
          const p = PACKS.find((x) => x.id === id) as PackDef;
          set((st) => ({ boosts: { ...st.boosts, [p.boost]: st.boosts[p.boost] + p.count } }));
        } else set((st) => ({ owned: [...st.owned, id] }));
        return true;
      },
      unlockSample(id) {
        const item = ITEM_BY_ID[id];
        const s = get();
        if (!item?.adSample || s.owned.includes(id) || s.sampled.includes(id)) return;
        set({ owned: [...s.owned, id], sampled: [...s.sampled, id] });
      },
      equip(id) {
        const item = ITEM_BY_ID[id];
        if (!item || item.kind === 'pack' || !get().owned.includes(id)) return;
        set((s) => ({ equipped: { ...s.equipped, [item.kind]: id } }));
      },
      useBoost(kind) {
        const s = get();
        if (s.boosts[kind] <= 0) return false;
        set({ boosts: { ...s.boosts, [kind]: s.boosts[kind] - 1 } });
        return true;
      },
      reset() {
        set(initial());
      },
    }),
    { name: 'utopia.economy', version: 1, storage: safeJSONStorage() },
  ),
);

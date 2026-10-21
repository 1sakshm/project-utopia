import { describe, expect, it } from 'vitest';
import { hasProgress, mergeSaves, SAVE_SCHEMA, type SaveDoc } from './saveMerge';
import { emptyProgress, type SessionRecord } from './progress';

const session = (id: string, t: number, score = 10): SessionRecord => ({ id, gameId: 'loom', t, ms: 60000, score, level: 2, mode: 'normal', timing: 'standard', stats: {} });

function doc(over: Partial<SaveDoc> & { econ?: Partial<SaveDoc['economy']> } = {}): SaveDoc {
  return {
    schema: SAVE_SCHEMA,
    savedAt: 1000,
    progress: { games: {}, history: [] },
    settings: {},
    ...over,
    economy: {
      orbs: 50,
      xp: 0,
      owned: ['skin-aurora'],
      sampled: [],
      equipped: { skin: 'skin-aurora', theme: 'theme-aurora' },
      boosts: { slowmo: 0, secondWind: 0 },
      quests: { day: '2026-10-21', list: [] },
      ads: { day: '2026-10-21', count: 0 },
      ...over.econ,
    },
  };
}

describe('cloud save merge', () => {
  it('keeps the best of each device for a game', () => {
    const a = doc({ progress: { games: { loom: { ...emptyProgress(), best: 500, highestLevel: 3, sessions: 4, lastPlayed: 10 } }, history: [] } });
    const b = doc({ progress: { games: { loom: { ...emptyProgress(), best: 300, highestLevel: 7, sessions: 9, lastPlayed: 20, tutorialDone: true } }, history: [] } });
    const g = mergeSaves(a, b).progress.games.loom;
    expect(g.best).toBe(500);
    expect(g.highestLevel).toBe(7);
    expect(g.sessions).toBe(9);
    expect(g.tutorialDone).toBe(true);
    expect(g.lastPlayed).toBe(20);
  });

  it('combines history without duplicates, newest first', () => {
    const a = doc({ progress: { games: {}, history: [session('x', 3), session('y', 1)] } });
    const b = doc({ progress: { games: {}, history: [session('y', 1), session('z', 2)] } });
    expect(mergeSaves(a, b).progress.history.map((h) => h.id)).toEqual(['x', 'z', 'y']);
  });

  it('never loses orbs, XP or unlocks', () => {
    const a = doc({ econ: { orbs: 120, xp: 40, owned: ['skin-aurora', 'skin-ember'] } });
    const b = doc({ econ: { orbs: 90, xp: 300, owned: ['skin-aurora', 'theme-dusk'] } });
    const e = mergeSaves(a, b).economy;
    expect(e.orbs).toBe(120);
    expect(e.xp).toBe(300);
    expect(e.owned.sort()).toEqual(['skin-aurora', 'skin-ember', 'theme-dusk']);
  });

  it('merges same-day quests by progress and claims', () => {
    const q = (progress: number, claimed: boolean) => ({ id: 'q1', progress, claimed });
    const a = doc({ econ: { quests: { day: '2026-10-21', list: [q(2, false)] } } });
    const b = doc({ econ: { quests: { day: '2026-10-21', list: [q(1, true)] } } });
    expect(mergeSaves(a, b).economy.quests.list[0]).toMatchObject({ progress: 2, claimed: true });
  });

  it('knows an empty guest from a real one', () => {
    expect(hasProgress(doc())).toBe(false);
    expect(hasProgress(doc({ progress: { games: {}, history: [session('a', 1)] } }))).toBe(true);
  });
});

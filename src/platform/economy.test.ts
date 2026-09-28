import { beforeEach, describe, expect, it } from 'vitest';
import { AD_DAILY_CAP, levelFor, levelProgress, questsFor, sessionReward, useEconomy, xpForLevel } from './economy';

const facts = (over: Partial<Parameters<ReturnType<typeof useEconomy.getState>['applySession']>[0]> = {}) => ({
  gameId: 'echo-garden',
  ring: 'memory' as const,
  voice: false,
  levelReached: 4,
  completed: true,
  isPb: false,
  assisted: false,
  ms: 120000,
  ...over,
});

describe('levels', () => {
  it('level math is monotonic and consistent', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(xpForLevel(2))).toBe(2);
    expect(levelFor(xpForLevel(5) - 1)).toBe(4);
    const p = levelProgress(xpForLevel(3) + 10);
    expect(p.level).toBe(3);
    expect(p.frac).toBeGreaterThan(0);
    expect(p.frac).toBeLessThan(1);
  });
  it('assisted runs earn half orbs but full XP', () => {
    const a = sessionReward({ levelReached: 5, completed: true, assisted: false, ms: 60000 });
    const b = sessionReward({ levelReached: 5, completed: true, assisted: true, ms: 60000 });
    expect(b.orbs).toBe(Math.round(a.orbs / 2));
    expect(b.xp).toBe(a.xp);
  });
});

describe('quests', () => {
  it('are deterministic per day and differ across days', () => {
    expect(questsFor('2026-09-29')).toEqual(questsFor('2026-09-29'));
    expect(questsFor('2026-09-29').length).toBe(3);
    const days = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map((d) => questsFor(d).map((q) => q.id).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });
});

describe('economy store', () => {
  beforeEach(() => useEconomy.getState().reset());

  it('awards orbs/xp and progresses + claims quests', () => {
    const s = useEconomy.getState();
    const orbs0 = s.orbs;
    const r = s.applySession(facts());
    expect(r.orbs).toBeGreaterThan(0);
    expect(useEconomy.getState().orbs).toBe(orbs0 + r.orbs);
    // finish enough varied sessions to complete every quest type that can be completed with these facts
    for (const g of ['a', 'b', 'c', 'd', 'e']) useEconomy.getState().applySession(facts({ gameId: g, levelReached: 7, isPb: true, voice: true }));
    const done = useEconomy.getState().todayQuests().filter((q) => q.progress >= q.target && q.kind !== 'family');
    expect(done.length).toBeGreaterThan(0);
    const before = useEconomy.getState().orbs;
    const got = useEconomy.getState().claimQuest(done[0].id);
    expect(got).toBe(done[0].reward);
    expect(useEconomy.getState().orbs).toBe(before + got);
    expect(useEconomy.getState().claimQuest(done[0].id)).toBe(0); // can't claim twice
  });

  it('guards spending and purchases', () => {
    const s = useEconomy.getState();
    expect(s.spend(999999)).toBe(false);
    s.award(1000);
    expect(useEconomy.getState().buy('skin-sunrise')).toBe(true);
    expect(useEconomy.getState().buy('skin-sunrise')).toBe(false); // already owned
    expect(useEconomy.getState().buy('pack-slowmo')).toBe(true);
    expect(useEconomy.getState().boosts.slowmo).toBe(1 + 3);
    useEconomy.getState().equip('skin-sunrise');
    expect(useEconomy.getState().equipped.skin).toBe('skin-sunrise');
    useEconomy.getState().equip('skin-nebula'); // not owned → ignored
    expect(useEconomy.getState().equipped.skin).toBe('skin-sunrise');
  });

  it('caps rewarded ads per day', () => {
    for (let i = 0; i < AD_DAILY_CAP; i++) {
      expect(useEconomy.getState().canWatchAd()).toBe(true);
      useEconomy.getState().noteAd();
    }
    expect(useEconomy.getState().canWatchAd()).toBe(false);
    expect(useEconomy.getState().adsLeft()).toBe(0);
  });

  it('boost inventory', () => {
    expect(useEconomy.getState().useBoost('secondWind')).toBe(true);
    expect(useEconomy.getState().useBoost('secondWind')).toBe(false);
  });
});

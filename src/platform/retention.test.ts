import { describe, expect, it } from 'vitest';
import { GAME_BY_ID } from '@/games/registry';
import { ABILITY_RING } from './abilities';
import { emptyProgress } from './progress';
import { nextUp, shareText, starsFor, todayTrio, trioStatus } from './retention';

const ringOf = (id: string) => ABILITY_RING[GAME_BY_ID[id].manifest.abilities.primary];

describe("today's 3", () => {
  it('is deterministic per day, three distinct ability families, all scored games', () => {
    const a = todayTrio('2026-10-05');
    expect(a).toEqual(todayTrio('2026-10-05'));
    expect(a).toHaveLength(3);
    expect(new Set(a.map(ringOf)).size).toBe(3);
    for (const id of a) expect(GAME_BY_ID[id].manifest.showScore).not.toBe(false);
    const days = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].map((d) => todayTrio(d).join());
    expect(new Set(days).size).toBeGreaterThan(1);
  });

  it('tracks completion from dailyBest and builds share text', () => {
    const day = '2026-10-05';
    const [x, y, z] = todayTrio(day);
    const games = {
      [x]: { ...emptyProgress(), sessions: 1, dailyBest: { day, score: 420 } },
      [y]: { ...emptyProgress(), sessions: 1, dailyBest: { day: '2026-10-04', score: 999 } },
    };
    const st = trioStatus(games, day);
    expect(st.done).toEqual([true, false, false]);
    expect(st.complete).toBe(false);
    const full = trioStatus({ ...games, [y]: { ...emptyProgress(), dailyBest: { day, score: 1 } }, [z]: { ...emptyProgress(), dailyBest: { day, score: 0 } } }, day);
    expect(full.complete).toBe(true);
    const text = shareText(full);
    expect(text).toContain("Today's 3");
    expect(text).toContain('420');
    expect(text).toContain('playutopia.pages.dev');
  });
});

describe('mastery stars', () => {
  it('first star for finishing, more for deeper levels; calm games by visits', () => {
    expect(starsFor('echo-garden', undefined)).toBe(0);
    expect(starsFor('echo-garden', { ...emptyProgress(), sessions: 1, highestLevel: 2 })).toBe(1);
    expect(starsFor('echo-garden', { ...emptyProgress(), sessions: 2, highestLevel: 4 })).toBe(2);
    expect(starsFor('echo-garden', { ...emptyProgress(), sessions: 9, highestLevel: 8 })).toBe(3);
    expect(starsFor('still-water', { ...emptyProgress(), sessions: 3 })).toBe(2);
  });
});

describe('up next', () => {
  it('suggests a different ability, preferring unplayed games', () => {
    const n = nextUp('echo-garden', {});
    expect(n).not.toBeNull();
    expect(ringOf(n!)).not.toBe(ringOf('echo-garden'));
    const played = nextUp('echo-garden', { [n!]: { ...emptyProgress(), sessions: 5 } });
    expect(played).not.toBe(n);
  });
});

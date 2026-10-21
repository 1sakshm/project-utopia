import { describe, expect, it } from 'vitest';
import { canPair, pairQueue, pickOpponent, ratingWindow, type Seeker } from './matchmaking';

const NOW = 1_000_000;
const s = (pid: string, rating: number, waitedMs = 0, gameId: string | null = null): Seeker => ({ pid, rating, since: NOW - waitedMs, gameId });

describe('rating window', () => {
  it('starts at ±100 and widens with waiting, then opens fully at 20 s', () => {
    expect(ratingWindow(0)).toBe(100);
    expect(ratingWindow(5_000)).toBe(200);
    expect(ratingWindow(10_000)).toBe(400);
    expect(ratingWindow(15_000)).toBe(800);
    expect(ratingWindow(19_999)).toBeLessThan(Infinity);
    expect(ratingWindow(20_000)).toBe(Infinity);
    expect(ratingWindow(-50)).toBe(100);
  });
  it('never shrinks', () => {
    let prev = 0;
    for (let t = 0; t <= 25_000; t += 250) {
      expect(ratingWindow(t)).toBeGreaterThanOrEqual(prev);
      prev = ratingWindow(t);
    }
  });
});

describe('pairing', () => {
  it('pairs close ratings straight away', () => {
    expect(canPair(s('a', 1000), s('b', 1080), NOW)).toBe(true);
  });
  it('holds back a big gap until someone has waited long enough', () => {
    expect(canPair(s('a', 1000), s('b', 1500), NOW)).toBe(false);
    expect(canPair(s('a', 1000, 12_000), s('b', 1500), NOW)).toBe(true); // 12 s → window ≈ 528
    expect(canPair(s('a', 1000, 20_000), s('b', 2600), NOW)).toBe(true);
  });
  it('never pairs a player with themselves or across different chosen games', () => {
    expect(canPair(s('a', 1000), s('a', 1000), NOW)).toBe(false);
    expect(canPair(s('a', 1000, 0, 'x'), s('b', 1000, 0, 'y'), NOW)).toBe(false);
    expect(canPair(s('a', 1000, 0, 'x'), s('b', 1000, 0, null), NOW)).toBe(true);
  });
  it('picks the closest allowed rating, then the longest waiter', () => {
    const me = s('me', 1200);
    expect(pickOpponent(me, [s('far', 1290), s('near', 1230), s('out', 1600)], NOW)?.pid).toBe('near');
    expect(pickOpponent(me, [s('new', 1250, 1000), s('old', 1150, 4000)], NOW)?.pid).toBe('old');
    expect(pickOpponent(me, [s('out', 1600)], NOW)).toBeNull();
  });
  it('sweeps a queue: longest waiters first, everyone at most once', () => {
    const q = [s('a', 1000, 1000), s('b', 1050, 500), s('c', 1900, 3000), s('d', 1950, 100), s('e', 3000, 0)];
    const pairs = pairQueue(q, NOW).map(([x, y]) => [x.pid, y.pid].sort().join('-'));
    expect(pairs.sort()).toEqual(['a-b', 'c-d']);
    // Twenty seconds later the outlier is matched with whoever is left.
    const later = pairQueue([s('e', 3000, 21_000), s('f', 1000, 0)], NOW);
    expect(later).toHaveLength(1);
  });
});

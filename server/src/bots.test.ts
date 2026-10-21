import { describe, expect, it } from 'vitest';
import { BOT_PREFIX, botIdentity, botLevel, botRating, botScore, isBot, makeBrain, MEDIUM_OF_BEST, ratingScale, shareAt } from './bots';
import type { GhostRun } from '../../src/platform/versus/protocol';

/** Deterministic random numbers for tests. */
function seq(...xs: number[]) {
  let i = 0;
  return () => xs[i++ % xs.length];
}
const ROUND = 60_000;

describe('bots', () => {
  it('are marked as bots and rated close to the player', () => {
    const b = botIdentity(seq(0.1, 0.5, 0.9));
    expect(b.pid.startsWith(BOT_PREFIX)).toBe(true);
    expect(isBot(b.pid)).toBe(true);
    expect(isBot('abcdefghij0123456789')).toBe(false);
    expect(b.name).toMatch(/^\w+ \w+$/);
    for (const r of [0, 0.5, 1]) expect(Math.abs(botRating(1200, () => r) - 1200)).toBeLessThanOrEqual(40);
  });

  it('aims at a typical run when the player has a best, with luck either side', () => {
    const lo = makeBrain({ best: 1000, rating: 1000, ghosts: [], rand: () => 0 });
    const hi = makeBrain({ best: 1000, rating: 1000, ghosts: [], rand: () => 0.999 });
    expect(lo.target).toBeCloseTo(1000 * MEDIUM_OF_BEST * 0.87, 0);
    expect(hi.target!).toBeGreaterThan(1000 * MEDIUM_OF_BEST * 1.12);
    // Medium: the average target sits just under the player's best.
    const avg = (lo.target! + hi.target!) / 2;
    expect(avg).toBeLessThan(1000);
    expect(avg).toBeGreaterThan(800);
  });

  it('falls back to ghosts scaled by rating, then to pacing', () => {
    const ghosts: GhostRun[] = [400, 500, 600].map((score) => ({ name: 'x', score, timeline: [[0, 0], [30000, score / 2], [60000, score]] }));
    const strong = makeBrain({ rating: 1300, ghosts, rand: () => 0.5 });
    const weak = makeBrain({ rating: 700, ghosts, rand: () => 0.5 });
    expect(strong.target!).toBeGreaterThan(weak.target!);
    expect(strong.target!).toBeCloseTo(500 * ratingScale(1300) * 1.0, 0);
    expect(makeBrain({ rating: 1000, ghosts: [], rand: () => 0.5 }).target).toBeNull();
  });

  it('scores rise monotonically to the target by the end of the round', () => {
    const b = makeBrain({ best: 2000, rating: 1000, ghosts: [], rand: () => 0.5 });
    let s = 0;
    const r = seq(0.9, 0.1, 0.5, 0.2);
    for (let t = 0; t <= ROUND; t += 700) {
      const n = botScore(b, t, ROUND, s, 0, r);
      expect(n).toBeGreaterThanOrEqual(s);
      s = n;
    }
    s = botScore(b, ROUND, ROUND, s, 0, r);
    expect(Math.abs(s - b.target!)).toBeLessThanOrEqual(b.step);
    expect(s % b.step).toBe(0);
    expect(botLevel(b, ROUND, ROUND)).toBe(b.topLevel);
    expect(botLevel(b, 0, ROUND)).toBe(1);
  });

  it('paces on the human when nothing is known', () => {
    const b = makeBrain({ rating: 1000, ghosts: [], rand: () => 0.5 }); // luck = 1.0
    // Human at 300 halfway → projects 600; bot at halfway ~ 600 * 0.5^1.08.
    const s = botScore(b, ROUND / 2, ROUND, 0, 300, () => 0.9);
    expect(s).toBeGreaterThan(250);
    expect(s).toBeLessThan(320);
  });

  it('follows a ghost shape', () => {
    const shape: Array<[number, number]> = [[0, 0], [0.5, 0.8], [1, 1]];
    expect(shareAt(shape, 0.25)).toBeCloseTo(0.4);
    expect(shareAt(shape, 0.75)).toBeCloseTo(0.9);
    expect(shareAt(null, 1)).toBe(1);
  });
});

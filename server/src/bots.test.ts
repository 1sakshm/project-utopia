import { describe, expect, it } from 'vitest';
import { botIdentity, botRating, MEDIUM_OF_BEST, mulberry, planFor, simulate, stateAt } from './bots';
import { PID_RE } from './util';
import { checkHandle } from '../../src/platform/versus/handles';
import { profileFor, PROFILES, HOUSE_POOL, type GameProfile } from './gameProfiles';

const ROUND = 60_000;

describe('stand-in identity', () => {
  it('looks like any other player', () => {
    for (let i = 0; i < 50; i++) {
      const b = botIdentity();
      expect(PID_RE.test(b.pid)).toBe(true);
      expect(b.pid).toHaveLength(20);
      expect(b.name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      expect(checkHandle(b.handle)).toBeNull();
      expect(b.skin).toMatch(/^skin-/);
    }
    for (const r of [0, 0.5, 0.999]) expect(Math.abs(botRating(1200, () => r) - 1200)).toBeLessThanOrEqual(45);
  });
});

describe('simulated sessions', () => {
  const shoalLike: GameProfile = { points: 100, perLevel: 0, step: 100, cadenceMs: [5500, 6500, 8000], accuracy: 0.5, levelEveryCorrect: 1, firstScoreMs: 5500 };

  it('scores only in the game’s own increments, at the game’s pace', () => {
    const plan = simulate(shoalLike, ROUND, 1, 42);
    expect(plan.events.length).toBeGreaterThan(0);
    let prevT = 0;
    let prevS = 0;
    for (const [t, s] of plan.events) {
      expect(s % 100).toBe(0);
      expect(s - prevS === 0 || s - prevS === 100).toBe(true);
      if (s !== prevS && prevS > 0) expect(t - prevT).toBeGreaterThanOrEqual(5500 * 0.5); // never faster than a trial allows
      if (s !== prevS) prevT = t;
      prevS = s;
    }
    expect(plan.events[0][0]).toBeGreaterThanOrEqual(5500 * 0.85);
    expect(plan.final).toBeLessThanOrEqual(1000); // ~9 trials at most in a minute
  });

  it('is deterministic for a seed and gets better with skill', () => {
    expect(simulate(shoalLike, ROUND, 1, 7)).toEqual(simulate(shoalLike, ROUND, 1, 7));
    const avg = (k: number) => {
      let n = 0;
      for (let i = 0; i < 200; i++) n += simulate(shoalLike, ROUND, k, i).final;
      return n / 200;
    };
    expect(avg(1.4)).toBeGreaterThan(avg(1));
    expect(avg(1)).toBeGreaterThan(avg(0.7));
  });

  it('aims at a medium target from the player’s best', () => {
    const id = Object.keys(PROFILES)[0] ?? 'shoal';
    const p = profileFor(id);
    const typical = simulate(p, ROUND, 1, 1).final || 1000;
    const best = Math.max(200, typical * 1.2);
    let sum = 0;
    const N = 60;
    const r = mulberry(99);
    for (let i = 0; i < N; i++) sum += planFor({ gameId: id, roundMs: ROUND, best, rating: 1000, ghosts: [], rand: r }).final;
    const mean = sum / N;
    expect(mean).toBeGreaterThan(best * MEDIUM_OF_BEST * 0.75);
    expect(mean).toBeLessThan(best * MEDIUM_OF_BEST * 1.25);
  });

  it('reports the latest event at any moment', () => {
    const plan = { events: [[1000, 100, 1], [5000, 200, 2]] as Array<[number, number, number]>, final: 200 };
    expect(stateAt(plan, 0)).toEqual({ s: 0, l: 1 });
    expect(stateAt(plan, 1000)).toEqual({ s: 100, l: 1 });
    expect(stateAt(plan, 59000)).toEqual({ s: 200, l: 2 });
  });

  it('has a profile for every always-live game', () => {
    for (const id of HOUSE_POOL) expect(PROFILES[id]).toBeDefined();
  });
});

describe('real game profiles', () => {
  it('Shoal pays in 25s after each ~12 s trial, never in fractions', () => {
    for (let seed = 0; seed < 50; seed++) {
      const plan = simulate(profileFor('shoal'), ROUND, 1, seed);
      let prev = 0;
      let prevT = -Infinity;
      for (const [t, s] of plan.events) {
        expect(s % 25).toBe(0);
        if (s !== prev) {
          expect(t).toBeGreaterThanOrEqual(10_000);
          expect(t - prevT).toBeGreaterThanOrEqual(9_000);
          expect([25, 100]).toContain(s - prev);
          prevT = t;
        }
        prev = s;
      }
    }
  });

  it('every game scores in its own step and never past the minute', () => {
    for (const [id, p] of Object.entries(PROFILES)) {
      const plan = simulate(p, ROUND, 1, 11);
      for (const [t, s] of plan.events) {
        expect(t, id).toBeLessThanOrEqual(ROUND);
        expect(s % p.step, id).toBe(0);
        expect(s, id).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

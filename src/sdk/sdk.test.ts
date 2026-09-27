import { describe, expect, it } from 'vitest';
import { createRng, dailySeed, hashString } from './rng';
import { createStaircase } from './difficulty';
import { clamp, mixHex } from './util';

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(xs).toEqual(Array.from({ length: 5 }, () => b.next()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it('int stays in range', () => {
    const r = createRng(1);
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
  it('daily seed differs per game and per day', () => {
    const d = new Date('2026-09-27T10:00:00Z');
    expect(dailySeed('a', d)).toBe(dailySeed('a', d));
    expect(dailySeed('a', d)).not.toBe(dailySeed('b', d));
    expect(dailySeed('a', d)).not.toBe(dailySeed('a', new Date('2026-09-28T10:00:00Z')));
    expect(hashString('x')).toBeGreaterThanOrEqual(0);
  });
});

describe('staircase', () => {
  it('2-up/1-down moves as expected and clamps', () => {
    const s = createStaircase({ start: 2, min: 1, max: 4, up: 2, down: 1 });
    s.record(true);
    expect(s.level).toBe(2);
    s.record(true);
    expect(s.level).toBe(3);
    s.record(false);
    expect(s.level).toBe(2);
    for (let i = 0; i < 20; i++) s.record(true);
    expect(s.level).toBe(4);
    for (let i = 0; i < 20; i++) s.record(false);
    expect(s.level).toBe(1);
  });
});

describe('util', () => {
  it('clamp and mixHex', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});

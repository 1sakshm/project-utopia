import { describe, expect, it } from 'vitest';
import { asyncOutcome, elo, isRoomCode, rankValue, relativeScore, ROOM_CODE_ALPHABET } from './protocol';
import { cleanName } from '../profile';
import { checkHandle, slugHandle } from './handles';

describe('versus protocol', () => {
  it('elo is zero-sum between equal players and favors the underdog', () => {
    expect(elo(1000, 1000, 1)).toBe(16);
    expect(elo(1000, 1000, 0)).toBe(-16);
    expect(elo(1000, 1000, 0.5)).toBe(0);
    expect(elo(1000, 1400, 1)).toBeGreaterThan(elo(1400, 1000, 1));
  });

  it('room codes avoid look-alike characters', () => {
    for (const c of '01IO') expect(ROOM_CODE_ALPHABET).not.toContain(c);
    expect(isRoomCode('AB2CD')).toBe(true);
    expect(isRoomCode('AB0CD')).toBe(false);
    expect(isRoomCode('abcde')).toBe(false);
    expect(isRoomCode('ABCDEF')).toBe(false);
  });

  it('cleans display names', () => {
    expect(cleanName('  Swift   Otter ')).toBe('Swift Otter');
    expect(cleanName('a\u0000b\nc')).toBe('abc');
    expect(cleanName('x'.repeat(40))).toHaveLength(20);
  });

  it('validates @handles', () => {
    expect(checkHandle('sucksome')).toBeNull();
    expect(checkHandle('@sucksome')).toBeNull();
    expect(checkHandle('ben_stone.99')).toBeNull();
    expect(checkHandle('ab')).toMatch(/least/);
    expect(checkHandle('9lives')).toMatch(/letter/);
    expect(checkHandle('has space')).toMatch(/letters/);
    expect(checkHandle('double__under')).toMatch(/doubled/);
    expect(checkHandle('trailing_')).toMatch(/trailing/);
    expect(checkHandle('Admin')).toMatch(/reserved/);
    expect(checkHandle('x'.repeat(21))).toMatch(/most/);
  });

  it('suggests handles from names', () => {
    expect(slugHandle('Swift Otter')).toBe('swiftotter');
    expect(slugHandle('9 Lives')).toBe('p9lives');
    expect(slugHandle('!!')).toBe('player');
  });

  it('friendly scoring compares each player with their own best', () => {
    expect(relativeScore(1240, 1000)).toBe(124);
    expect(relativeScore(500, 1500)).toBe(33.3);
    expect(relativeScore(0, 800)).toBe(0);
    // No best yet: this run is the baseline.
    expect(relativeScore(300, 0)).toBe(100);
    expect(relativeScore(300, undefined)).toBe(100);
    expect(relativeScore(0, 0)).toBe(0);
    expect(relativeScore(1e9, 1)).toBe(999.9);
    // A newcomer at 120% of their best beats a veteran at 90% of theirs, despite the raw scores.
    const newcomer = { score: 600, best: 500 };
    const veteran = { score: 4500, best: 5000 };
    expect(rankValue('friendly', newcomer)).toBeGreaterThan(rankValue('friendly', veteran));
    expect(rankValue('standard', newcomer)).toBeLessThan(rankValue('standard', veteran));
    expect(rankValue(undefined, veteran)).toBe(4500);
  });

  it('async challenge outcomes', () => {
    expect(asyncOutcome(1240, 1300)).toBe('won');
    expect(asyncOutcome(1240, 1240)).toBe('draw');
    expect(asyncOutcome(1240, 900)).toBe('lost');
  });
});

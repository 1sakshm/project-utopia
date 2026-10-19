import { describe, expect, it } from 'vitest';
import { elo, isRoomCode, ROOM_CODE_ALPHABET } from './protocol';
import { cleanName } from '../profile';

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
});

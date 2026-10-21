import { describe, expect, it } from 'vitest';
import { parseAsyncCreate, parseReplyScore } from './challenges';

const good = { handle: '@sucksome', gameId: 'lantern-lake', seed: 123456, startLevel: 3, score: 1240 };

describe('async challenge input', () => {
  it('accepts a scored run', () => {
    expect(parseAsyncCreate(good)).toEqual({ ...good, handle: 'sucksome' });
  });
  it('defaults the start level to 1', () => {
    expect(parseAsyncCreate({ ...good, startLevel: undefined })).toMatchObject({ startLevel: 1 });
  });
  it('accepts full 32-bit seeds (daily seeds are unsigned hashes)', () => {
    expect(parseAsyncCreate({ ...good, seed: 0xffffffff })).not.toHaveProperty('error');
    expect(parseAsyncCreate({ ...good, seed: 0x100000000 })).toHaveProperty('error');
    expect(parseAsyncCreate({ ...good, seed: -1 })).toHaveProperty('error');
    expect(parseAsyncCreate({ ...good, seed: 1.5 })).toHaveProperty('error');
  });
  it('rejects junk', () => {
    expect(parseAsyncCreate({ ...good, handle: '' })).toHaveProperty('error');
    expect(parseAsyncCreate({ ...good, gameId: '../etc' })).toHaveProperty('error');
    expect(parseAsyncCreate({ ...good, score: 0 })).toHaveProperty('error');
    expect(parseAsyncCreate({ ...good, score: '1240' })).toHaveProperty('error');
    expect(parseAsyncCreate({ ...good, startLevel: 0 })).toHaveProperty('error');
  });
  it('parses reply scores', () => {
    expect(parseReplyScore(1300)).toBe(1300);
    expect(parseReplyScore(0)).toBe(0);
    expect(parseReplyScore(12.9)).toBe(12);
    expect(parseReplyScore(-1)).toBeNull();
    expect(parseReplyScore('9')).toBeNull();
    expect(parseReplyScore(Infinity)).toBeNull();
  });
});

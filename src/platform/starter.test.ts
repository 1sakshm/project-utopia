import { describe, expect, it } from 'vitest';
import { GAME_BY_ID } from '@/games/registry';
import { ABILITY_RING } from './abilities';
import { emptyProgress } from './progress';
import { STARTER_IDS, STARTER_MINUTES, starterStatus } from './starter';

describe('starter check', () => {
  it('has one adaptive, mic-free game per family except Calm', () => {
    const rings = STARTER_IDS.map((id) => ABILITY_RING[GAME_BY_ID[id].manifest.abilities.primary]);
    expect(new Set(rings).size).toBe(STARTER_IDS.length);
    expect(rings).not.toContain('calm');
    expect(STARTER_IDS).toHaveLength(7);
    for (const id of STARTER_IDS) expect(GAME_BY_ID[id].manifest.input.requiresAudio).toBe(false);
    expect(STARTER_MINUTES).toBeGreaterThan(5);
    expect(STARTER_MINUTES).toBeLessThan(25);
  });

  it('counts games already played and points at the next one', () => {
    const [a, b] = STARTER_IDS;
    const st = starterStatus({ [a]: { ...emptyProgress(), sessions: 2 } });
    expect(st.count).toBe(1);
    expect(st.next).toBe(b);
    const all = Object.fromEntries(STARTER_IDS.map((id) => [id, { ...emptyProgress(), sessions: 1 }]));
    expect(starterStatus(all)).toMatchObject({ complete: true, next: null, count: 7 });
  });

  it('counts a family as done when any adaptive game in it was played', () => {
    const memory = STARTER_IDS.find((id) => ABILITY_RING[GAME_BY_ID[id].manifest.abilities.primary] === 'memory')!;
    const other = ['lantern-lake', 'digit-echo', 'echo-garden', 'starback'].find((id) => id !== memory)!;
    const st = starterStatus({ [other]: { ...emptyProgress(), sessions: 1 } });
    expect(st.done[STARTER_IDS.indexOf(memory)]).toBe(true);
  });
});

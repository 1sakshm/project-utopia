import { describe, expect, it } from 'vitest';
import { gainText, growthByFamily } from './growth';
import type { SessionRecord } from './progress';

const DAY = 864e5;
const NOW = Date.UTC(2026, 9, 21);
let n = 0;
const s = (gameId: string, level: number, daysAgo: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: String(n++),
  gameId,
  t: NOW - daysAgo * DAY,
  ms: 60000,
  score: 100,
  level,
  mode: 'normal',
  timing: 'standard',
  stats: {},
  ...extra,
});
const fam = (h: SessionRecord[], id: string) => growthByFamily(h, NOW).find((f) => f.ring.id === id)!;

describe('growth by family', () => {
  it('measures first session to best of the last three, averaged per game', () => {
    const h = [s('lantern-lake', 2, 40), s('lantern-lake', 4, 20), s('lantern-lake', 7, 10), s('lantern-lake', 5, 1), s('digit-echo', 3, 5), s('digit-echo', 4, 2)];
    const m = fam(h, 'memory');
    expect(m.games).toBe(2);
    expect(m.sessions).toBe(6);
    expect(m.gain).toBeCloseTo((7 - 2 + (4 - 3)) / 2); // lantern +5, digit +1
    // Month window: lantern was at 2 before it and reached 7 inside it; digit 3 → 4.
    expect(m.monthGain).toBeCloseTo((5 + 1) / 2);
    expect(m.series.at(-1)).toBeCloseTo(3);
  });

  it('ignores assisted runs, unadaptive games and single sessions', () => {
    const h = [s('lantern-lake', 2, 3), s('lantern-lake', 9, 2, { assisted: true }), s('still-water', 1, 1), s('still-water', 1, 0)];
    expect(fam(h, 'memory').gain).toBeNull();
    expect(fam(h, 'memory').sessions).toBe(1);
    expect(fam(h, 'calm').sessions).toBe(0);
  });

  it('reads naturally', () => {
    expect(gainText(3)).toBe('up 3 levels');
    expect(gainText(1)).toBe('up 1 level');
    expect(gainText(-1.3)).toBe('down 1.3 levels');
    expect(gainText(0.04)).toBe('steady');
  });
});

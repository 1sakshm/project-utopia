import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, historyCsv } from './exportCsv';
import type { SessionRecord } from './progress';

const rec = (t: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
  id: String(t),
  gameId: 'lantern-lake',
  t,
  ms: 61234,
  score: 1240,
  level: 6,
  mode: 'normal',
  timing: 'standard',
  stats: { span: 5, 'note, "quoted"': 1 },
  ...extra,
});

describe('history CSV', () => {
  it('writes a header and one row per session, oldest first, with safe quoting', () => {
    const csv = historyCsv([rec(Date.UTC(2026, 9, 21)), rec(Date.UTC(2026, 9, 20), { assisted: true, mode: 'daily' })]);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(CSV_COLUMNS.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[1].startsWith('2026-10-20T00:00:00.000Z,lantern-lake,Lantern Lake,memory,spatial-memory,daily,standard,true,61.2,1240,6,')).toBe(true);
    // The stats JSON contains commas and quotes, so it must be quoted with doubled quotes.
    expect(lines[2].endsWith('"{""span"":5,""note, \\""quoted\\"""":1}"')).toBe(true);
  });

  it('handles an empty history', () => {
    expect(historyCsv([])).toBe(CSV_COLUMNS.join(',') + '\r\n');
  });
});

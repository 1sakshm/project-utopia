import type { Staircase } from './types';

/**
 * n-up / m-down staircase over an integer level.
 * up=2, down=1 converges to ~70.7% success; up=3, down=1 to ~79%.
 */
export function createStaircase(opts: { start?: number; min?: number; max?: number; up?: number; down?: number } = {}): Staircase {
  const min = opts.min ?? 1;
  const max = opts.max ?? 99;
  const up = opts.up ?? 2;
  const down = opts.down ?? 1;
  let level = Math.max(min, Math.min(max, opts.start ?? min));
  let streakOk = 0;
  let streakBad = 0;
  return {
    get level() {
      return level;
    },
    record(correct) {
      if (correct) {
        streakBad = 0;
        if (++streakOk >= up) {
          streakOk = 0;
          level = Math.min(max, level + 1);
        }
      } else {
        streakOk = 0;
        if (++streakBad >= down) {
          streakBad = 0;
          level = Math.max(min, level - 1);
        }
      }
      return level;
    },
    set(l) {
      level = Math.max(min, Math.min(max, l));
      streakOk = 0;
      streakBad = 0;
    },
  };
}
